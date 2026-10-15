import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { BlastRadius } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { BlastService } from '../src/modules/blast/service.js';
import type { BlastResult, RepoIntel } from '../src/modules/repo-intel/types.js';

const hasDocker = (await dockerAvailable()) || !!process.env.TEST_DATABASE_URL;
const d = hasDocker ? describe : describe.skip;

const FIXTURE: BlastResult = {
  changedSymbols: [{ file: 'src/lib/money.ts', name: 'formatMoney', kind: 'function' }],
  callers: [
    { file: 'src/routes/refunds.ts', symbol: 'refund', viaSymbol: 'formatMoney', line: 12, rank: 2 },
    { file: 'src/routes/orders.ts', symbol: 'order', viaSymbol: 'formatMoney', line: 30, rank: 1 },
  ],
  impactedEndpoints: ['GET /refunds'],
  factsByFile: {
    'src/routes/refunds.ts': { endpoints: ['GET /refunds'], crons: [] },
    'src/routes/orders.ts': { endpoints: [], crons: [] },
  },
  degraded: false,
};

d('GET /pulls/:id/blast', () => {
  let pg: PgFixture;
  let prId: string;
  let repoId: string;
  let workspaceId: string;
  let paths: string[];
  const llm = new MockLLMProvider('openai');

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [pr] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.number, 482));
    prId = pr!.id;
    repoId = pr!.repoId;
    workspaceId = pr!.workspaceId;
    const files = await pg.handle.db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
    paths = files.map((f) => f.path);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp(result: BlastResult) {
    const getBlastRadius = vi.fn(async () => result);
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        llm: { openrouter: llm },
        repoIntel: { getBlastRadius } as unknown as RepoIntel,
      },
    });
    return { app, getBlastRadius };
  }

  it('returns a parseable BlastRadius and reads the index once with the PR file paths', async () => {
    const { app: appP, getBlastRadius } = makeApp(FIXTURE);
    const app = await appP;
    const res = await app.inject({ method: 'GET', url: `/pulls/${prId}/blast` });
    await app.close();
    expect(res.statusCode).toBe(200);
    const body = BlastRadius.parse(res.json());
    expect(body.downstream[0]!.callers).toHaveLength(2);
    expect(body.downstream[0]!.endpoints_affected).toEqual(['GET /refunds']);
    expect(getBlastRadius).toHaveBeenCalledTimes(1);
    const [calledRepo, calledPaths] = getBlastRadius.mock.calls[0] as unknown as [string, string[]];
    expect(calledRepo).toBe(repoId);
    expect([...calledPaths].sort()).toEqual([...paths].sort());
  });

  it('surfaces degraded + reason', async () => {
    const { app: appP } = makeApp({ changedSymbols: [], callers: [], impactedEndpoints: [], degraded: true, reason: 'no_data' });
    const app = await appP;
    const res = await app.inject({ method: 'GET', url: `/pulls/${prId}/blast` });
    await app.close();
    expect(res.json()).toMatchObject({ degraded: true, reason: 'no_data' });
  });

  it('404s for an unknown PR', async () => {
    const { app: appP } = makeApp(FIXTURE);
    const app = await appP;
    const res = await app.inject({ method: 'GET', url: `/pulls/${randomUUID()}/blast` });
    await app.close();
    expect(res.statusCode).toBe(404);
    expect(res.json()).toHaveProperty('error');
  });

  it('makes no LLM call', async () => {
    const { app: appP } = makeApp(FIXTURE);
    const app = await appP;
    await app.inject({ method: 'GET', url: `/pulls/${prId}/blast` });
    await app.close();
    expect(llm.calls).toEqual([]);
  });

  it('logs the index read with counts only', async () => {
    const { app: appP } = makeApp(FIXTURE);
    const app = await appP;
    const info: { obj: Record<string, unknown>; msg?: string }[] = [];
    const logger = {
      info: (obj: unknown, msg?: string) => info.push({ obj: obj as Record<string, unknown>, msg }),
      error: () => undefined,
    };
    await new BlastService(app.container).get(workspaceId, prId, logger);
    await app.close();
    expect(info).toHaveLength(1);
    expect(info[0]!.msg).toBe('blast: read repo-intel index');
    expect(info[0]!.obj).toEqual({
      prId,
      files: paths.length,
      symbols: 1,
      callers: 2,
      degraded: false,
      reason: undefined,
    });
    expect(JSON.stringify(info[0])).not.toContain('formatMoney');
  });
});
