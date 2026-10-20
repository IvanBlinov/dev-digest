import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { StructuredRequest, StructuredResult } from '@devdigest/shared';
import { OnboardingTourState } from '@devdigest/shared';
import { ONBOARDING_PROMPT_VERSION } from '@devdigest/reviewer-core';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { SpyGit, makeNarrative, makeTour } from './helpers/onboarding-fixtures.js';

const hasDb = (await dockerAvailable()) || Boolean(process.env.TEST_DATABASE_URL);
const d = hasDb ? describe : describe.skip;

if (!hasDb) {
  // eslint-disable-next-line no-console
  console.warn('[onboarding] Docker not available — skipping integration tests.');
}

/** MockLLMProvider whose next answer the test can hold back or turn into a failure. */
class ScriptedLLM extends MockLLMProvider {
  hold: Promise<void> | null = null;
  fail: Error | null = null;
  arrived = 0;

  constructor() {
    super('openai', {
      structured: makeNarrative({
        architecture: 'A small service.',
        critical_path_reasons: [{ path: 'src/app.ts', reason: 'Entry point' }],
        commands: [{ id: 'install', comment: 'first step' }],
        reading_path: [{ path: 'src/app.ts', why: 'Start here' }],
        first_tasks: [{ title: 'Add a route', description: 'Add GET /ping', paths: ['src/app.ts'] }],
      }),
    });
  }

  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.arrived += 1;
    if (this.hold) await this.hold;
    if (this.fail) throw this.fail;
    return super.completeStructured(req);
  }
}

const FILES: Record<string, string> = {
  'README.md': '# Demo\nA demo service.',
  'package.json': JSON.stringify({ name: 'demo', scripts: { dev: 'vite', test: 'vitest run' } }),
  'pnpm-lock.yaml': 'lockfileVersion: 9',
  '.env': 'SECRET=do-not-read',
  'src/app.ts': 'export {}',
};
const ROOT = ['.env', 'README.md', 'package.json', 'pnpm-lock.yaml', 'src'];

const PATHS: [string, number][] = [
  ['src/app.ts', 0.9],
  ['src/db.ts', 0.8],
  ['src/util.ts', 0.7],
  ['src/zed.ts', 0.6],
];
const EDGES: [string, string][] = [
  ['src/app.ts', 'src/db.ts'],
  ['src/app.ts', 'src/util.ts'],
  ['src/util.ts', 'src/db.ts'],
  ['src/zed.ts', 'src/db.ts'],
];

type StateBody = {
  status: string;
  cloned: boolean;
  tour: null | { status: string; generated_at: string; index_sha: string | null; reasons: string[] };
  stale: boolean;
  stale_reason: string | null;
  index_updated_at: string | null;
  last_error: null | { reason: string; at: string };
};

/**
 * L05b S13 (red phase) — onboarding routes over a real Postgres: lifecycle (AC-1 .. AC-13),
 * NFR-2 (GET never generates) and the NFR-3 GET latency bound.
 */
d('onboarding routes (L05b)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let n = 0;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function makeApp(llm: ScriptedLLM, nodeEnv: 'test' | 'development' = 'test') {
    const config = loadConfig({ ...process.env, NODE_ENV: nodeEnv, LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new SpyGit({ files: FILES, root: ROOT }),
        github: new MockGitHubClient(),
        llm: { openrouter: llm, openai: llm, anthropic: llm },
        tokenizer: { count: (text: string) => Math.ceil(text.length / 4) },
      },
    });
  }
  type App = Awaited<ReturnType<typeof makeApp>>;

  /** A repo with a clone (unless `cloned: false`) and an index: ranks, edges, facts, index state. */
  async function mkRepo(opts: { cloned?: boolean; indexed?: boolean; sha?: string } = {}): Promise<string> {
    const { cloned = true, indexed = true, sha = 'sha-1' } = opts;
    n += 1;
    const db = pg.handle.db;
    const [repo] = await db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: `onb-${n}`,
        fullName: `acme/onb-${n}`,
        clonePath: cloned ? `/mock/clones/acme/onb-${n}` : null,
      })
      .returning();
    const repoId = repo!.id;
    if (indexed) {
      await db.insert(t.fileRank).values(
        PATHS.map(([filePath, rank], i) => ({ repoId, filePath, pagerank: rank, hotness: 0, rank, percentile: 99 - i })),
      );
      await db.insert(t.fileEdges).values(EDGES.map(([fromFile, toFile]) => ({ repoId, fromFile, toFile })));
      await db.insert(t.fileFacts).values([{ repoId, filePath: 'src/app.ts', endpoints: ['GET /a', 'POST /b'], crons: [] }]);
      await db.insert(t.repoIndexState).values({
        repoId,
        lastIndexedSha: sha,
        indexerVersion: 1,
        status: 'full',
        filesIndexed: PATHS.length,
        filesSkipped: 0,
        stats: { totalCandidates: PATHS.length, bounded: 0 },
      });
    }
    return repoId;
  }

  const getState = async (app: App, repoId: string) => {
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/onboarding` });
    expect(res.statusCode).toBe(200);
    return res.json() as StateBody;
  };
  const post = (app: App, repoId: string) => app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });

  async function waitDone(app: App, repoId: string): Promise<StateBody> {
    for (let i = 0; i < 200; i++) {
      const s = await getState(app, repoId);
      if (s.status !== 'generating') return s;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('generation did not finish');
  }
  async function until(cond: () => boolean) {
    for (let i = 0; i < 200 && !cond(); i++) await new Promise((r) => setTimeout(r, 25));
    expect(cond()).toBe(true);
  }

  const insertRow = (repoId: string, row: Record<string, unknown>) =>
    pg.handle.db.insert(t.onboarding).values({ repoId, ...row } as never);

  it('AC-3: no tour → status none, tour null, cloned true', async () => {
    const llm = new ScriptedLLM();
    const app = await makeApp(llm);
    const repoId = await mkRepo();
    expect(await getState(app, repoId)).toMatchObject({ status: 'none', tour: null, cloned: true, stale: false, stale_reason: null, last_error: null });
    expect(llm.arrived).toBe(0);
    await app.close();
  });

  it('AC-1: POST → 202 {status:"generating"}; after settle, GET returns ready or partial with a tour', async () => {
    const llm = new ScriptedLLM();
    const app = await makeApp(llm);
    const repoId = await mkRepo();
    const res = await post(app, repoId);
    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ status: 'generating' });
    const done = await waitDone(app, repoId);
    expect(['ready', 'partial']).toContain(done.status);
    expect(done.tour).not.toBeNull();
    expect(done.tour!.status).toBe(done.status);
    expect(llm.arrived).toBe(1);
    await app.close();
  });

  it('AC-2: the response parses as OnboardingTourState', async () => {
    const llm = new ScriptedLLM();
    const app = await makeApp(llm);
    const repoId = await mkRepo();
    expect(OnboardingTourState.safeParse(await getState(app, repoId)).success).toBe(true);
    await post(app, repoId);
    const done = await waitDone(app, repoId);
    const parsed = OnboardingTourState.safeParse(done);
    expect(parsed.success, JSON.stringify((parsed as { error?: unknown }).error ?? {})).toBe(true);
    await app.close();
  });

  it('AC-4: POST while running → 409 onboarding_generation_running; mock calls stay at 1', async () => {
    const llm = new ScriptedLLM();
    let release!: () => void;
    llm.hold = new Promise<void>((r) => (release = r));
    const app = await makeApp(llm);
    const repoId = await mkRepo();
    expect((await post(app, repoId)).statusCode).toBe(202);
    await until(() => llm.arrived === 1);

    const second = await post(app, repoId);
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('onboarding_generation_running');
    expect((await getState(app, repoId)).status).toBe('generating');

    release();
    await waitDone(app, repoId);
    expect(llm.arrived).toBe(1);
    await app.close();
  });

  it('AC-5: clonePath null → POST 409 repo_not_cloned with 0 LLM calls; GET cloned false', async () => {
    const llm = new ScriptedLLM();
    const app = await makeApp(llm);
    const repoId = await mkRepo({ cloned: false });
    const res = await post(app, repoId);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('repo_not_cloned');
    expect(llm.arrived).toBe(0);
    expect(await getState(app, repoId)).toMatchObject({ cloned: false, status: 'none', tour: null });
    await app.close();
  });

  it("AC-6: app with nodeEnv 'development' → the 7th POST within a minute gets 429", async () => {
    const llm = new ScriptedLLM();
    const app = await makeApp(llm, 'development');
    const repoId = await mkRepo();
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await post(app, repoId)).statusCode);
    for (const s of statuses.slice(0, 6)) expect([202, 409]).toContain(s);
    expect(statuses[6]).toBe(429);
    await app.close();
  });

  it('AC-7: a generating row started 11 min ago → GET failed / interrupted; then POST → 202', async () => {
    const llm = new ScriptedLLM();
    const app = await makeApp(llm);
    const repoId = await mkRepo();
    await insertRow(repoId, { status: 'generating', json: null, startedAt: new Date(Date.now() - 11 * 60_000) });
    const state = await getState(app, repoId);
    expect(state.status).toBe('failed');
    expect(state.last_error?.reason).toBe('interrupted');
    expect(state.tour).toBeNull();
    expect((await post(app, repoId)).statusCode).toBe(202);
    const done = await waitDone(app, repoId);
    expect(['ready', 'partial']).toContain(done.status);
    await app.close();
  });

  it('AC-8: tour readable from a fresh buildApp on the same DB', async () => {
    const llm = new ScriptedLLM();
    const app = await makeApp(llm);
    const repoId = await mkRepo();
    await post(app, repoId);
    const done = await waitDone(app, repoId);
    await app.close();

    const app2 = await makeApp(new ScriptedLLM());
    const again = await getState(app2, repoId);
    expect(again.status).toBe(done.status);
    expect(again.tour!.generated_at).toBe(done.tour!.generated_at);
    await app2.close();
  });

  it('AC-9: a second run that fails → GET failed, previous tour kept, last_error set', async () => {
    const llm = new ScriptedLLM();
    const app = await makeApp(llm);
    const repoId = await mkRepo();
    await post(app, repoId);
    const first = await waitDone(app, repoId);
    expect(['ready', 'partial']).toContain(first.status);

    llm.fail = new Error('provider exploded');
    expect((await post(app, repoId)).statusCode).toBe(202);
    const second = await waitDone(app, repoId);
    expect(second.status).toBe('failed');
    expect(second.tour).toEqual(first.tour);
    expect(second.last_error?.reason).toBe('llm_error');
    expect(Number.isNaN(Date.parse(second.last_error!.at))).toBe(false);
    await app.close();
  });

  it('AC-10: first run fails → skeleton', async () => {
    const llm = new ScriptedLLM();
    llm.fail = new Error('provider exploded');
    const app = await makeApp(llm);
    const repoId = await mkRepo();
    await post(app, repoId);
    const done = await waitDone(app, repoId);
    expect(done.status).toBe('skeleton');
    expect(done.tour?.status).toBe('skeleton');
    expect(done.tour?.reasons).toContain('llm_error');
    expect(done.last_error?.reason).toBe('llm_error');
    await app.close();
  });

  it('AC-12: index-state row with a different sha → stale true / index_moved', async () => {
    const llm = new ScriptedLLM();
    const app = await makeApp(llm);
    const repoId = await mkRepo({ sha: 'sha-1' });
    await post(app, repoId);
    const done = await waitDone(app, repoId);
    expect(done.tour!.index_sha).toBe('sha-1');
    expect(done).toMatchObject({ stale: false, stale_reason: null });

    await pg.handle.db.update(t.repoIndexState).set({ lastIndexedSha: 'sha-2' }).where(eq(t.repoIndexState.repoId, repoId));
    const moved = await getState(app, repoId);
    expect(moved).toMatchObject({ stale: true, stale_reason: 'index_moved' });
    await app.close();
  });

  it('AC-13: DELETE /repos/:id → the onboarding row is gone', async () => {
    const llm = new ScriptedLLM();
    const app = await makeApp(llm);
    const repoId = await mkRepo();
    await post(app, repoId);
    await waitDone(app, repoId);
    expect(await pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId))).toHaveLength(1);

    const res = await app.inject({ method: 'DELETE', url: `/repos/${repoId}` });
    expect(res.statusCode).toBe(200);
    expect(await pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId))).toHaveLength(0);
    await app.close();
  });

  it('NFR-2: GET starts no generation in any stored state', async () => {
    const llm = new ScriptedLLM();
    const app = await makeApp(llm);
    const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
    const tour = (status: string) => makeTour({ status, prompt_version: ONBOARDING_PROMPT_VERSION });
    const common = { promptVersion: ONBOARDING_PROMPT_VERSION, indexSha: 'sha-1' };

    const cases: { name: string; row: Record<string, unknown> | null; expected: string }[] = [
      { name: 'none', row: null, expected: 'none' },
      { name: 'generating fresh', row: { status: 'generating', json: null, startedAt: minutesAgo(1) }, expected: 'generating' },
      { name: 'generating stale', row: { status: 'generating', json: null, startedAt: minutesAgo(11) }, expected: 'failed' },
      { name: 'ready', row: { ...common, status: 'ready', json: tour('ready') }, expected: 'ready' },
      { name: 'partial', row: { ...common, status: 'partial', json: tour('partial') }, expected: 'partial' },
      { name: 'skeleton', row: { ...common, status: 'skeleton', json: tour('skeleton') }, expected: 'skeleton' },
      {
        name: 'failed',
        row: { ...common, status: 'failed', json: tour('ready'), lastError: { reason: 'llm_error', at: new Date().toISOString() } },
        expected: 'failed',
      },
    ];

    for (const c of cases) {
      const repoId = await mkRepo();
      if (c.row) await insertRow(repoId, c.row);
      const before = c.row ? (await pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId)))[0]! : null;

      const first = await getState(app, repoId);
      const second = await getState(app, repoId);
      expect(first.status, c.name).toBe(c.expected);
      expect(second.status, c.name).toBe(c.expected);

      const after = (await pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId)))[0] ?? null;
      if (!c.row) {
        expect(after, c.name).toBeNull();
      } else {
        expect(after!.startedAt?.getTime() ?? null, c.name).toBe(before!.startedAt?.getTime() ?? null);
      }
    }
    expect(llm.arrived).toBe(0);
    // no generation is in flight, so closing the app (which settles the service) returns at once
    const t0 = Date.now();
    await app.close();
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it('NFR-3: GET p95 ≤ 300 ms with a stored ready tour', async () => {
    const llm = new ScriptedLLM();
    const app = await makeApp(llm);
    const repoId = await mkRepo();
    const base = makeTour({ prompt_version: ONBOARDING_PROMPT_VERSION });
    const sections = base.sections;
    const big = makeTour({
      prompt_version: ONBOARDING_PROMPT_VERSION,
      known_paths: Array.from({ length: 200 }, (_, i) => `src/file-${i}.ts`),
      sections: {
        ...sections,
        reading_path: {
          ...sections.reading_path,
          items: Array.from({ length: 8 }, (_, i) => ({ path: `src/file-${i}.ts`, why: 'Imported by 3 files', why_source: 'deterministic' })),
        },
      },
    });
    await insertRow(repoId, { status: 'ready', json: big, promptVersion: ONBOARDING_PROMPT_VERSION, indexSha: 'sha-1' });

    await getState(app, repoId); // warm-up
    const times: number[] = [];
    for (let i = 0; i < 20; i++) {
      const start = performance.now();
      await getState(app, repoId);
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    expect(times[18]!).toBeLessThanOrEqual(300); // p95 = the 19th fastest of 20
    expect(llm.arrived).toBe(0);
    await app.close();
  });
});
