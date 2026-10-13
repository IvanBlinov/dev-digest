import { describe, it, expect, vi, afterEach } from 'vitest';
import type { GitHubClient } from '@devdigest/shared';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import { ConfigError } from '../src/platform/errors.js';
import { resolveSources, missingContextLines } from '../src/modules/intent/source-resolver.js';
import type { ExtractedRefs } from '../src/modules/intent/helpers.js';

const repo = { owner: 'acme', name: 'payments-api' };
const refs = (over: Partial<ExtractedRefs>): ExtractedRefs => ({ issues: [], docs: [], unresolved: [], ...over });
const run = (gh: GitHubClient, r: ExtractedRefs) =>
  resolveSources({ github: async () => gh, repo, headSha: 'head1', refs: r });

afterEach(() => vi.useRealTimers());

describe('resolveSources', () => {
  it('ok issue → #471 ok with text', async () => {
    const gh = new MockGitHubClient({ issues: { 471: { number: 471, title: 'Rate limit', body: 'Body', state: 'open' } } });
    const r = await run(gh, refs({ issues: [471] }));
    expect(r.sources).toEqual([{ kind: 'issue', ref: '#471', status: 'ok', truncated: false }]);
    expect(r.promptSources[0]).toMatchObject({ kind: 'issue', ref: '#471', status: 'ok' });
    expect(r.promptSources[0]!.text).toContain('Rate limit');
    expect(missingContextLines(r.sources)).toEqual([]);
  });

  it('doc 404 → not_found, a missing line and no text; fetched at headSha', async () => {
    const gh = new MockGitHubClient();
    const r = await run(gh, refs({ docs: [{ path: 'specs/missing.md', kind: 'spec' }] }));
    expect(r.sources[0]).toMatchObject({ kind: 'spec', ref: 'specs/missing.md', status: 'not_found' });
    expect(r.promptSources[0]!.text).toBeUndefined();
    expect(missingContextLines(r.sources)).toHaveLength(1);
    expect(gh.fileCalls).toEqual([{ path: 'specs/missing.md', ref: 'head1' }]);
  });

  it('403 → forbidden; 413 → too_large; 415 → unsupported', async () => {
    const gh = new MockGitHubClient({
      issues: { 7: { status: 403 } },
      files: { 'a.md': { status: 413 }, 'b.md': { status: 415 } },
    });
    const r = await run(gh, refs({ issues: [7], docs: [{ path: 'a.md', kind: 'spec' }, { path: 'b.md', kind: 'spec' }] }));
    expect(r.sources.map((s) => s.status)).toEqual(['forbidden', 'too_large', 'unsupported']);
  });

  it('a never-resolving getter → timeout', async () => {
    vi.useFakeTimers();
    const gh = new MockGitHubClient();
    gh.getIssue = () => new Promise(() => {});
    const p = run(gh, refs({ issues: [1] }));
    await vi.advanceTimersByTimeAsync(8_001);
    expect((await p).sources[0]!.status).toBe('timeout');
  });

  it('oversize doc is truncated and flagged', async () => {
    const gh = new MockGitHubClient({ files: { 'big.md': 'x'.repeat(20_000) } });
    const r = await run(gh, refs({ docs: [{ path: 'big.md', kind: 'spec' }] }));
    expect(r.sources[0]).toMatchObject({ status: 'ok', truncated: true });
    expect(r.promptSources[0]!.text).toHaveLength(12_000);
  });

  it('github() throwing ConfigError → every explicit ref unavailable, no throw', async () => {
    const r = await resolveSources({
      github: async () => {
        throw new ConfigError('no token');
      },
      repo,
      headSha: 'h',
      refs: refs({ issues: [1], docs: [{ path: 'a.md', kind: 'plan' }] }),
    });
    expect(r.sources.map((s) => s.status)).toEqual(['unavailable', 'unavailable']);
  });

  it('unresolved refs pass through with their status and become missing lines', async () => {
    const r = await run(new MockGitHubClient(), refs({ unresolved: [{ kind: 'link', ref: 'PROJ-1', status: 'unsupported' }] }));
    expect(r.sources).toEqual([{ kind: 'link', ref: 'PROJ-1', status: 'unsupported' }]);
    expect(missingContextLines(r.sources)[0]).toContain('PROJ-1');
  });
});
