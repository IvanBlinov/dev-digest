import { describe, it, expect } from 'vitest';
import { Review } from '@devdigest/shared';
import {
  MockLLMProvider,
  MockGitClient,
  MockGitHubClient,
  MockCodeIndex,
  MockEmbedder,
} from '../src/adapters/mocks.js';
import { assemblePrompt } from '../src/platform/prompt.js';
import { groundFindings } from '../src/platform/grounding.js';
import { estimateCost } from '../src/adapters/llm/pricing.js';

describe('mock adapters (no network)', () => {
  it('MockGitClient.diff parses into hunks with new line numbers', async () => {
    const git = new MockGitClient();
    const diff = await git.diff();
    expect(diff.files[0]!.path).toBe('src/config.ts');
    expect(diff.files[0]!.hunks[0]!.newLineNumbers.length).toBeGreaterThan(0);
  });

  it('MockGitHubClient records posted reviews and opened PRs', async () => {
    const gh = new MockGitHubClient();
    await gh.postReview({ owner: 'a', name: 'b' }, 482, { body: 'x', event: 'COMMENT' });
    expect(gh.posted).toHaveLength(1);
    const { url } = await gh.openPullRequest({ owner: 'a', name: 'b' }, {
      title: 't',
      head: 'h',
      base: 'main',
      body: 'b',
    });
    expect(url).toContain('github.com');
  });

  it('MockGitHubClient.getFileContent returns mapped content and records the ref', async () => {
    const gh = new MockGitHubClient({ files: { 'specs/a.md': '# spec' } });
    const repo = { owner: 'a', name: 'b' };
    const f = await gh.getFileContent(repo, 'specs/a.md', 'abc123');
    expect(f.content).toBe('# spec');
    expect(gh.fileCalls).toEqual([{ path: 'specs/a.md', ref: 'abc123' }]);
    await expect(gh.getFileContent(repo, 'nope.md', 'abc123')).rejects.toMatchObject({ status: 404 });
  });

  it('MockGitHubClient.getIssue supports mapped issues and failures, default unchanged', async () => {
    const gh = new MockGitHubClient({
      issues: { 7: { status: 403 }, 8: { number: 8, title: 'T', body: 'B', state: 'open' } },
    });
    const repo = { owner: 'a', name: 'b' };
    await expect(gh.getIssue(repo, 7)).rejects.toMatchObject({ status: 403 });
    expect((await gh.getIssue(repo, 8)).title).toBe('T');
    expect(gh.issueCalls).toEqual([7, 8]);
    const plain = new MockGitHubClient();
    expect((await plain.getIssue(repo, 5)).title).toBe('Issue #5');
  });

  it('MockCodeIndex + MockEmbedder return deterministic shapes', async () => {
    const ci = new MockCodeIndex();
    expect((await ci.symbols({ owner: 'a', name: 'b' }))[0]!.name).toBe('rateLimit');
    const emb = await new MockEmbedder().embed(['a', 'b']);
    expect(emb[0]!).toHaveLength(1536);
  });
});

describe('structured review pipeline (mock LLM → grounding)', () => {
  it('runs assemble → completeStructured(Review) → groundFindings end-to-end', async () => {
    // a fixture review where one finding is grounded and one is hallucinated
    const fixture = {
      verdict: 'request_changes',
      summary: 'secret key committed',
      score: 38,
      findings: [
        {
          id: 'f1',
          severity: 'CRITICAL',
          category: 'security',
          title: 'Hardcoded Stripe secret key',
          file: 'src/config.ts',
          start_line: 11,
          end_line: 11,
          rationale: 'sk_live in diff',
          confidence: 0.98,
          kind: 'finding',
        },
        {
          id: 'f-hallucinated',
          severity: 'WARNING',
          category: 'bug',
          title: 'phantom finding on a line not in the diff',
          file: 'src/config.ts',
          start_line: 999,
          end_line: 999,
          rationale: 'not real',
          confidence: 0.3,
          kind: 'finding',
        },
      ],
    };
    const llm = new MockLLMProvider('openai', { structured: fixture });
    const git = new MockGitClient();
    const diff = await git.diff();

    const { messages } = assemblePrompt({
      system: 'security reviewer',
      diff: diff.raw,
      task: 'Review PR #482',
    });
    const result = await llm.completeStructured({
      model: 'gpt-4.1',
      schema: Review,
      schemaName: 'Review',
      messages,
    });
    expect(result.data.findings).toHaveLength(2);

    const grounded = groundFindings(result.data.findings, diff);
    expect(grounded.kept).toHaveLength(1); // the real one survives
    expect(grounded.kept[0]!.id).toBe('f1');
    expect(grounded.dropped[0]!.finding.id).toBe('f-hallucinated');
    expect(llm.calls.find((c) => c.method === 'completeStructured')).toBeTruthy();
  });
});

describe('pricing / cost discipline', () => {
  it('estimates cost for known models and returns null for unknown', () => {
    expect(estimateCost('gpt-4o-mini', 1_000_000, 0)).toBeCloseTo(0.15, 5);
    expect(estimateCost('some-future-model', 1000, 1000)).toBeNull();
  });
});
