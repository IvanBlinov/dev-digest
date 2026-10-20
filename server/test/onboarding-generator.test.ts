import { describe, it, expect, vi } from 'vitest';
import type { LLMProvider, StructuredRequest } from '@devdigest/shared';
import { ONBOARDING_PROMPT_VERSION } from '@devdigest/reviewer-core';
import { generateOnboarding } from '../src/modules/onboarding/generator.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import { ConfigError } from '../src/platform/errors.js';
import { TimeoutError } from '../src/platform/resilience.js';
import { SpyGit, makeNarrative } from './helpers/onboarding-fixtures.js';

/**
 * L05b S12 (red phase) — the generator: facts → ONE narrative call → tour. Hermetic: MockLLMProvider,
 * a SpyGit, a fake RepoIntel and ONE captured sink that records every `log` and `promptLog` call.
 *
 * Pinned interface (see the test report, "Needs from implementer"):
 *   generateOnboarding({ repo, workspaceId }, deps) -> Promise<{ tour, failure: OnboardingReason | null }>
 *   deps = { repoIntel, git, resolveModel(feature) -> {provider, model}, llm(provider) -> Promise<LLMProvider>
 *            (throws ConfigError without a key), tokenizer, log(line: string), promptLog(event), now(): number }
 *   repoIntel additions used: getOnboardingGraph(repoId), getAllFileFacts(repoId); IndexState.filesTotal / bounded.
 */

const REPO = {
  id: 'repo-1',
  owner: 'acme',
  name: 'demo',
  fullName: 'acme/demo',
  defaultBranch: 'main',
  clonePath: '/mock/clones/acme/demo',
};

const README_MARKER = 'README_SECRET_MARKER';
const NARRATIVE_MARKER = 'NARRATIVE_MARKER_TEXT';

const FILES: Record<string, string> = {
  'README.md': `# Demo\n${README_MARKER}\n${'r'.repeat(9000)}`,
  'package.json': JSON.stringify({ name: 'demo', scripts: { dev: 'vite', test: 'vitest run' } }),
  'pnpm-lock.yaml': 'lockfileVersion: 9',
  '.env': 'DB_PASSWORD=SUPERSECRETVALUE',
  '.env.local': 'TOKEN=SUPERSECRETLOCAL',
  '.env.example': 'API_URL=http://localhost\n',
  'docker-compose.yml': 'services:\n  api:\n    image: node\n',
  'src/app.ts': 'export {}',
};
const ROOT = ['.env', '.env.local', 'README.md', 'package.json', 'pnpm-lock.yaml', '.env.example', 'docker-compose.yml', 'src'];

const GRAPH = {
  files: [
    { path: 'src/app.ts', rank: 0.9 },
    { path: 'src/db.ts', rank: 0.8 },
    { path: 'src/util.ts', rank: 0.7 },
    { path: 'src/zed.ts', rank: 0.6 },
  ],
  edges: [
    { from: 'src/app.ts', to: 'src/db.ts' },
    { from: 'src/app.ts', to: 'src/util.ts' },
    { from: 'src/util.ts', to: 'src/db.ts' },
    { from: 'src/zed.ts', to: 'src/db.ts' },
  ],
};
const RANK_ORDER = ['src/app.ts', 'src/db.ts', 'src/util.ts', 'src/zed.ts'];

const NARRATIVE = makeNarrative({
  architecture: `${NARRATIVE_MARKER} a small service`,
  critical_path_reasons: [{ path: 'src/app.ts', reason: 'The entry point' }],
  commands: [{ id: 'install', comment: 'first step' }],
  // the model reverses the order; the server must keep rank order
  reading_path: [...RANK_ORDER].reverse().map((path) => ({ path, why: `why ${path}` })),
  first_tasks: [{ title: 'Add a route', description: 'Add GET /ping', paths: ['src/app.ts'] }],
});

type Intel = Record<string, unknown>;

function fakeIntel(over: Intel = {}) {
  const state = {
    repoId: REPO.id,
    status: 'full',
    filesIndexed: 4,
    filesSkipped: 0,
    durationMs: 1,
    lastIndexedSha: 'sha-abc',
    indexerVersion: 1,
    updatedAt: new Date('2026-10-19T09:00:00Z'),
    filesTotal: 4,
    bounded: 0,
  };
  const base: Intel = {
    getIndexState: async () => state,
    getOnboardingGraph: async () => GRAPH,
    getAllFileFacts: async () => [{ path: 'src/app.ts', endpoints: ['GET /a', 'POST /b'], crons: [] }],
    getCriticalPaths: async () => [['src/app.ts', 'src/db.ts']],
    getRepoMap: async () => ({ text: 'src/app.ts: export function main()', tokens: 10, cached: true }),
    getSymbolsInFiles: async () => [],
    getTopFilesByRank: async () => RANK_ORDER,
    getFileRank: async () => [],
    ...over,
  };
  // any other facade method the generator may call answers "nothing"
  return new Proxy(base, { get: (target, key) => (key in target ? target[key as string] : async () => []) });
}

interface Rec {
  kind: 'log' | 'prompt';
  line?: string;
  event?: Record<string, unknown>;
}

function setup(opts: { llm?: LLMProvider; intel?: Intel; files?: Record<string, string>; llmThrows?: Error; git?: SpyGit } = {}) {
  const sink: Rec[] = [];
  const mock = (opts.llm ?? new MockLLMProvider('openai', { structured: NARRATIVE })) as MockLLMProvider;
  const git = opts.git ?? new SpyGit({ files: opts.files ?? FILES, root: ROOT });
  let clock = 1_700_000_000_000;
  const llmFn = vi.fn(async (_provider: string) => {
    if (opts.llmThrows) throw opts.llmThrows;
    return mock as LLMProvider;
  });
  const resolveModel = vi.fn(async (_feature: string) => ({ provider: 'openrouter', model: 'custom/model-x' }));
  const deps = {
    repoIntel: fakeIntel(opts.intel),
    git,
    resolveModel,
    llm: llmFn,
    tokenizer: { count: (text: string) => Math.ceil(text.length / 4) },
    log: (line: string) => void sink.push({ kind: 'log', line }),
    promptLog: (event: Record<string, unknown>) => void sink.push({ kind: 'prompt', event }),
    now: () => (clock += 7),
  };
  const run = () => generateOnboarding({ repo: REPO, workspaceId: 'ws-1' } as never, deps as never);
  return { sink, mock, git, llmFn, resolveModel, run };
}

const doneLines = (sink: Rec[]) => sink.filter((r) => r.kind === 'log').map((r) => r.line!);

describe('generateOnboarding — one narrative call', () => {
  it('AC-71 / AC-15: cloned repo with a key → exactly 1 completeStructured call; `llm_calls=1`; reading path = the fixture\'s rank-desc order', async () => {
    const { run, mock, sink } = setup();
    const { tour, failure } = await run();
    expect(mock.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);
    expect(failure).toBeNull();
    expect(doneLines(sink)[0]).toMatch(/^onboarding: done repo=repo-1 status=(ready|partial) llm_calls=1 /);
    const items = (tour as { sections: { reading_path: { items: { path: string }[] } } }).sections.reading_path.items;
    expect(items.map((i) => i.path)).toEqual(RANK_ORDER);
    expect(['ready', 'partial']).toContain((tour as { status: string }).status);
  });

  it('AC-20 / AC-21 / NFR-4: the sink holds exactly 2 records — one `prompt.assembled` event (promptKind onboarding), then one line starting `onboarding: done` — and nothing else (success)', async () => {
    const { run, sink } = setup();
    await run();
    expect(sink).toHaveLength(2);
    expect(sink[0]!.kind).toBe('prompt');
    expect(sink[0]!.event!.promptKind).toBe('onboarding');
    expect(Array.isArray(sink[0]!.event!.sections)).toBe(true);
    expect(sink[1]!.kind).toBe('log');
    expect(sink[1]!.line!.startsWith('onboarding: done')).toBe(true);
  });

  it('AC-20 / AC-21 / NFR-4: the sink holds exactly 2 records — prompt event then done line — when there is no API key', async () => {
    const { run, sink } = setup({ llmThrows: new ConfigError('OPENROUTER_API_KEY is not configured') });
    await run();
    expect(sink.map((r) => r.kind)).toEqual(['prompt', 'log']);
    expect(sink[0]!.event!.promptKind).toBe('onboarding');
    expect(sink[1]!.line!.startsWith('onboarding: done')).toBe(true);
  });

  it('AC-20 / AC-21 / NFR-4: the sink holds exactly 2 records — prompt event then done line — when the provider fails (llm_error)', async () => {
    const failing = new MockLLMProvider('openai', { structured: NARRATIVE });
    failing.completeStructured = async () => {
      throw new Error('provider exploded');
    };
    const { run, sink } = setup({ llm: failing });
    await run();
    expect(sink.map((r) => r.kind)).toEqual(['prompt', 'log']);
    expect(sink[1]!.line!.startsWith('onboarding: done')).toBe(true);
  });

  it('AC-14 / AC-18: the request has maxRetries 0, timeoutMs 60000, maxTokens 3000, temperature 0.2', async () => {
    const { run, mock } = setup();
    await run();
    const req = mock.calls.find((c) => c.method === 'completeStructured')!.req as StructuredRequest<unknown>;
    expect(req.maxRetries).toBe(0);
    expect(req.timeoutMs).toBe(60_000);
    expect(req.maxTokens).toBe(3000);
    expect(req.temperature).toBe(0.2);
  });

  it("AC-17: the model comes from resolveModel('onboarding')", async () => {
    const { run, mock, resolveModel, llmFn } = setup();
    const { tour } = await run();
    expect(resolveModel).toHaveBeenCalledWith('onboarding');
    expect(llmFn).toHaveBeenCalledWith('openrouter');
    const req = mock.calls.find((c) => c.method === 'completeStructured')!.req as StructuredRequest<unknown>;
    expect(req.model).toBe('custom/model-x');
    expect((tour as { generation: { provider: string; model: string } }).generation).toMatchObject({
      provider: 'openrouter',
      model: 'custom/model-x',
    });
  });
});

describe('generateOnboarding — failures (AC-16, AC-19)', () => {
  it('AC-16: llm() throws ConfigError → 0 calls, `llm_calls=0`, no_api_key, skeleton', async () => {
    const { run, mock, sink } = setup({ llmThrows: new ConfigError('OPENROUTER_API_KEY is not configured') });
    const { tour, failure } = await run();
    expect(mock.calls).toHaveLength(0);
    expect(failure).toBe('no_api_key');
    expect(doneLines(sink)[0]).toContain('llm_calls=0');
    expect(doneLines(sink)[0]).toMatch(/reasons=no_api_key(\s|$)/);
    const t = tour as { status: string; reasons: string[]; generation: { llm_calls: number }; sections: { reading_path: { items: { path: string }[] } } };
    expect(t.status).toBe('skeleton');
    expect(t.reasons).toContain('no_api_key');
    expect(t.generation.llm_calls).toBe(0);
    // the deterministic content is still there
    expect(t.sections.reading_path.items.map((i) => i.path)).toEqual(RANK_ORDER);
  });

  it('AC-19: failure reasons — a provider error → llm_error; a TimeoutError → llm_timeout; schema failure → invalid_output; each produces a skeleton with that reason', async () => {
    const providerError = new MockLLMProvider('openai', { structured: NARRATIVE });
    providerError.completeStructured = async () => {
      throw new Error('503 upstream');
    };
    const timeout = new MockLLMProvider('openai', { structured: NARRATIVE });
    timeout.completeStructured = async () => {
      throw new TimeoutError(60_000);
    };
    // a narrative that does not parse into the contract (the mock throws "…failed schema…", like the adapters)
    const invalid = new MockLLMProvider('openai', { structured: { architecture: 42 } });

    const cases: [MockLLMProvider, string][] = [
      [providerError, 'llm_error'],
      [timeout, 'llm_timeout'],
      [invalid, 'invalid_output'],
    ];
    for (const [llm, reason] of cases) {
      const { run, sink } = setup({ llm });
      const { tour, failure } = await run();
      const t = tour as { status: string; reasons: string[] };
      expect(failure, reason).toBe(reason);
      expect(t.status, reason).toBe('skeleton');
      expect(t.reasons, reason).toContain(reason);
      expect(doneLines(sink)[0], reason).toMatch(new RegExp(`status=skeleton .*reasons=${reason}`));
      expect(doneLines(sink)[0], reason).toContain('llm_calls=1');
    }
  });
});

describe('generateOnboarding — tour metadata (AC-11, AC-22)', () => {
  it('AC-22: generation = {provider, model, llm_calls 1, tokens_in 100, tokens_out 50, cost_usd 0.001, duration_ms}', async () => {
    const { run, sink } = setup();
    const { tour } = await run();
    const g = (tour as { generation: Record<string, unknown> }).generation;
    expect(g).toMatchObject({
      provider: 'openrouter',
      model: 'custom/model-x',
      llm_calls: 1,
      tokens_in: 100,
      tokens_out: 50,
      cost_usd: 0.001,
    });
    expect(Number.isInteger(g.duration_ms)).toBe(true);
    expect(g.duration_ms as number).toBeGreaterThanOrEqual(0);
    expect(doneLines(sink)[0]).toContain('tokens_in=100 tokens_out=50 cost_usd=0.001');
  });

  it('AC-11: tour metadata — index_sha = lastIndexedSha (null without an index state); prompt_version and coverage are set', async () => {
    const withState = await setup().run();
    const t = withState.tour as { index_sha: string | null; prompt_version: string; generated_at: string; coverage: unknown; reasons: string[]; known_paths: string[] };
    expect(t.index_sha).toBe('sha-abc');
    expect(t.prompt_version).toBe(ONBOARDING_PROMPT_VERSION);
    expect(Number.isNaN(Date.parse(t.generated_at))).toBe(false);
    expect(t.coverage).toEqual({ files_indexed: 4, files_total: 4, partial: false });
    expect(Array.isArray(t.reasons)).toBe(true);
    expect(t.known_paths).toEqual(expect.arrayContaining(RANK_ORDER));

    const noState = await setup({
      intel: {
        getIndexState: async () => ({
          repoId: REPO.id,
          status: 'degraded',
          filesIndexed: 0,
          filesSkipped: 0,
          durationMs: 0,
          lastIndexedSha: '',
          indexerVersion: 0,
          updatedAt: new Date(0),
          degraded: true,
          degradedReason: 'no_data',
        }),
        getOnboardingGraph: async () => ({ files: [], edges: [] }),
        getAllFileFacts: async () => [],
        getCriticalPaths: async () => [],
      },
    }).run();
    expect((noState.tour as { index_sha: string | null }).index_sha).toBeNull();
  });
});

describe('generateOnboarding — what reaches the logs and the prompt (NFR-4, AC-23, AC-26)', () => {
  it('NFR-4: sink records contain no README text and no narrative text', async () => {
    for (const s of [setup(), setup({ llmThrows: new ConfigError('no key') })]) {
      await s.run();
      const dump = JSON.stringify(s.sink);
      expect(dump).not.toContain(README_MARKER);
      expect(dump).not.toContain(NARRATIVE_MARKER);
      expect(dump).not.toContain('Add GET /ping');
    }
  });

  it('AC-26: an oversize README → reasons include budget_trimmed and the done line has `dropped=readme`', async () => {
    const { run, sink, mock } = setup({
      intel: { getRepoMap: async () => ({ text: 'M'.repeat(80_000), tokens: 20_000, cached: true }) },
    });
    const { tour } = await run();
    expect((tour as { reasons: string[] }).reasons).toContain('budget_trimmed');
    expect(doneLines(sink)[0]).toMatch(/ dropped=readme(,|\s|$)/);
    // the request that was sent respects the input budget (8000 tokens, ceil(chars/4))
    const req = mock.calls.find((c) => c.method === 'completeStructured')!.req as StructuredRequest<unknown>;
    const tokens = req.messages.reduce((n, m) => n + Math.ceil(m.content.length / 4), 0);
    expect(tokens).toBeLessThanOrEqual(8000);
  });

  it('AC-23: `.env` is never read', async () => {
    const { run, git, mock } = setup();
    await run();
    expect(git.readPaths).not.toContain('.env');
    expect(git.readPaths).not.toContain('.env.local');
    const req = mock.calls.find((c) => c.method === 'completeStructured')!.req as StructuredRequest<unknown>;
    expect(JSON.stringify(req.messages)).not.toContain('SUPERSECRET');
  });
});

describe('generateOnboarding — index states (AC-44, AC-45)', () => {
  const degraded = {
    getIndexState: async () => ({
      repoId: REPO.id,
      status: 'degraded',
      filesIndexed: 0,
      filesSkipped: 0,
      durationMs: 0,
      lastIndexedSha: 'sha-abc',
      indexerVersion: 1,
      updatedAt: new Date(),
      degraded: true,
      degradedReason: 'index_failed',
    }),
    getOnboardingGraph: async () => ({ files: [], edges: [] }),
    getAllFileFacts: async () => [],
    getCriticalPaths: async () => [],
  };

  it('AC-44: degraded index → partial when the LLM succeeds, skeleton when it fails', async () => {
    const ok = await setup({ intel: degraded }).run();
    const t = ok.tour as { status: string; reasons: string[]; sections: { reading_path: { items: unknown[]; unavailable_reason: string } } };
    expect(t.status).toBe('partial');
    expect(t.reasons).toContain('index_degraded');
    expect(t.sections.reading_path.items).toEqual([]);
    expect(t.sections.reading_path.unavailable_reason).toBe('index_degraded');

    const failing = new MockLLMProvider('openai', { structured: NARRATIVE });
    failing.completeStructured = async () => {
      throw new Error('boom');
    };
    const bad = await setup({ intel: degraded, llm: failing }).run();
    expect((bad.tour as { status: string }).status).toBe('skeleton');
    expect((bad.tour as { reasons: string[] }).reasons).toEqual(expect.arrayContaining(['index_degraded', 'llm_error']));
  });

  it('AC-45: partial index → coverage.partial true', async () => {
    const { run } = setup({
      intel: {
        getIndexState: async () => ({
          repoId: REPO.id,
          status: 'partial',
          filesIndexed: 4,
          filesSkipped: 0,
          durationMs: 1,
          lastIndexedSha: 'sha-abc',
          indexerVersion: 1,
          updatedAt: new Date(),
          filesTotal: 10,
          bounded: 0,
        }),
      },
    });
    const { tour } = await run();
    const t = tour as { coverage: unknown; reasons: string[] };
    expect(t.coverage).toEqual({ files_indexed: 4, files_total: 10, partial: true });
    expect(t.reasons).toContain('index_partial');
  });
});

describe('generateOnboarding — performance (NFR-3)', () => {
  it('NFR-3: fact collection ≤ 10 s with 5000 files', async () => {
    const files = Array.from({ length: 5000 }, (_, i) => ({ path: `pkg${i % 40}/dir${i % 97}/file${i}.ts`, rank: 1 - i / 5000 }));
    const edges: { from: string; to: string }[] = [];
    for (let i = 0; i < 15_000; i++) {
      edges.push({ from: files[i % 5000]!.path, to: files[(i * 7 + 13) % 5000]!.path });
    }
    const facts = files.filter((_, i) => i % 50 === 0).map((f) => ({ path: f.path, endpoints: ['GET /x'], crons: [] }));

    let calledAt = 0;
    const timed = new MockLLMProvider('openai', { structured: NARRATIVE });
    const original = timed.completeStructured.bind(timed);
    timed.completeStructured = (async (req: StructuredRequest<unknown>) => {
      calledAt = Date.now();
      return original(req);
    }) as never as MockLLMProvider['completeStructured'];

    const { run } = setup({
      llm: timed,
      intel: {
        getIndexState: async () => ({
          repoId: REPO.id,
          status: 'full',
          filesIndexed: 5000,
          filesSkipped: 0,
          durationMs: 1,
          lastIndexedSha: 'sha-big',
          indexerVersion: 1,
          updatedAt: new Date(),
          filesTotal: 5000,
          bounded: 0,
        }),
        getOnboardingGraph: async () => ({ files, edges }),
        getAllFileFacts: async () => facts,
        getCriticalPaths: async () => [files.slice(0, 5).map((f) => f.path)],
      },
    });
    const start = Date.now();
    await run();
    expect(calledAt).toBeGreaterThan(0);
    expect(calledAt - start).toBeLessThanOrEqual(10_000);
  });
});
