import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { intentMockLlm, INTENT_FIXTURE } from './helpers/intent-mocks.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockEmbedder, MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { ReviewService } from '../src/modules/reviews/service.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

let n = 0;
const finding = (title: string, over: Record<string, unknown> = {}) => ({
  id: `f-${n++}-${title}`,
  severity: 'CRITICAL',
  category: 'security',
  title,
  file: 'src/config.ts',
  start_line: 11,
  end_line: 11,
  rationale: 'r',
  confidence: 0.9,
  kind: 'finding',
  scope: 'out',
  ...over,
});
const review = (findings: unknown[]) => ({ verdict: 'comment', summary: 's', score: 50, findings });

class DelayedLLM extends MockLLMProvider {
  constructor(id: 'openai' | 'anthropic', opts: ConstructorParameters<typeof MockLLMProvider>[1], private ms: number) {
    super(id, opts);
  }
  override async completeStructured<T>(req: Parameters<MockLLMProvider['completeStructured']>[0]) {
    await new Promise((r) => setTimeout(r, this.ms));
    return super.completeStructured<T>(req as never);
  }
}
class FailingLLM extends MockLLMProvider {
  override async completeStructured<T>(): Promise<never> {
    throw new Error('provider down');
  }
}

/**
 * One out-of-scope signal per review EXECUTION across all agents. Two test agents
 * (A on openai, B on anthropic) are run together through ReviewService with
 * per-provider mocks, against a stored fresh `medium` intent.
 */
d('scope filter: exactly one out-of-scope signal per review execution', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function setup(opts: { a: MockLLMProvider; b: MockLLMProvider; stale?: boolean }) {
    const db = pg.handle.db;
    const name = `scope-api-${seq++}`;
    const [repo] = await db.insert(t.repos).values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` }).returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 482,
        title: 'Add rate limiting',
        author: 'a',
        branch: 'feat/rl',
        base: 'main',
        headSha: 'a1b2c3d4',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
        body: 'Adds a token-bucket rate limiter to the public API so unauthenticated clients cannot abuse it.',
      })
      .returning();
    await db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });
    const app = await buildApp({
      config: config(),
      db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        github: new MockGitHubClient(),
        llm: {
          openai: opts.a,
          anthropic: opts.b,
          openrouter: intentMockLlm({ ...INTENT_FIXTURE, confidence: 'medium' }),
        },
      },
    });
    await app.inject({ method: 'POST', url: `/pulls/${pr!.id}/intent` });
    if (opts.stale) await db.update(t.pullRequests).set({ headSha: 'moved' }).where(eq(t.pullRequests.id, pr!.id));
    const mkAgent = async (label: string, provider: 'openai' | 'anthropic') => {
      const res = await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: `Scope ${label} ${seq++}`, provider, model: 'm', system_prompt: 'review' },
      });
      return (await app.container.agentsRepo.getById(workspaceId, res.json().id))!;
    };
    const agentA = await mkAgent('A', 'openai');
    const agentB = await mkAgent('B', 'anthropic');
    return { app, pr: pr!, agentA, agentB };
  }

  async function execute(ctx: Awaited<ReturnType<typeof setup>>) {
    const service = new ReviewService(ctx.app.container);
    const { runs } = await service.runReview(workspaceId, ctx.pr.id, [ctx.agentA, ctx.agentB]);
    return { runA: runs[0]!.run_id, runB: runs[1]!.run_id, service };
  }

  async function outcome(ctx: Awaited<ReturnType<typeof setup>>, runA: string, runB: string) {
    const db = pg.handle.db;
    await waitForPrRuns(db, ctx.pr.id, { expected: 2, timeoutMs: 15_000 });
    const runs = await db.select().from(t.agentRuns).where(inArray(t.agentRuns.id, [runA, runB]));
    const reviews = await db.select().from(t.reviews).where(eq(t.reviews.prId, ctx.pr.id));
    const findings = reviews.length
      ? await db.select().from(t.findings).where(inArray(t.findings.reviewId, reviews.map((r) => r.id)))
      : [];
    const byRun = (id: string) => ({
      run: runs.find((r) => r.id === id)!,
      review: reviews.find((r) => r.runId === id),
    });
    const logOf = async (id: string) =>
      ((await (await ctx.app.inject({ method: 'GET', url: `/runs/${id}/trace` })).json()).log as { msg: string }[]).map((l) => l.msg);
    return { a: byRun(runA), b: byRun(runB), findings, logOf };
  }

  it('(a) keeps exactly one out-of-scope finding across both agents — the higher-ranked one (B)', async () => {
    const a = new MockLLMProvider('openai', { structured: review([finding('A crit', { confidence: 0.9 })]) });
    const b = new MockLLMProvider('anthropic', {
      structured: review([finding('B crit', { confidence: 0.95 }), finding('B bug', { severity: 'WARNING', category: 'bug' })]),
    });
    const ctx = await setup({ a, b });
    const { runA, runB } = await execute(ctx);
    const o = await outcome(ctx, runA, runB);

    expect(o.a.run.status).toBe('done');
    expect(o.b.run.status).toBe('done');
    const out = o.findings.filter((f) => f.scope === 'out');
    expect(out.map((f) => f.title)).toEqual(['B crit']);
    expect(o.findings).toHaveLength(1);
    expect(out[0]!.reviewId).toBe(o.b.review!.id);
    expect(o.b.review!.score).toBe(65); // 100 − CRITICAL
    expect(o.a.review!.score).toBe(100);
    expect(o.b.run.blockers).toBe(1);
    expect(o.a.run.blockers).toBe(0);
    expect(o.b.run.findingsCount).toBe(1);
    expect(o.a.run.findingsCount).toBe(0);
    for (const id of [runA, runB]) {
      expect((await o.logOf(id)).some((m) => m.startsWith('Out-of-scope signal: kept "B crit"'))).toBe(true);
    }
    await ctx.app.close();
  });

  it('(b) no eligible candidate → zero out-of-scope findings, both runs done', async () => {
    const a = new MockLLMProvider('openai', { structured: review([finding('A bug', { severity: 'WARNING', category: 'bug' })]) });
    const b = new MockLLMProvider('anthropic', { structured: review([finding('B nit', { severity: 'SUGGESTION', category: 'style' })]) });
    const ctx = await setup({ a, b });
    const { runA, runB } = await execute(ctx);
    const o = await outcome(ctx, runA, runB);
    expect(o.a.run.status).toBe('done');
    expect(o.b.run.status).toBe('done');
    expect(o.findings).toHaveLength(0);
    expect((await o.logOf(runA)).some((m) => m === 'Out-of-scope signal: none')).toBe(true);
    await ctx.app.close();
  });

  it("(c) agent B's compute fails → B failed, A's candidate is persisted, A done", async () => {
    const a = new MockLLMProvider('openai', { structured: review([finding('A crit')]) });
    const ctx = await setup({ a, b: new FailingLLM('anthropic') });
    const { runA, runB } = await execute(ctx);
    const o = await outcome(ctx, runA, runB);
    expect(o.b.run.status).toBe('failed');
    expect(o.a.run.status).toBe('done');
    expect(o.findings.filter((f) => f.scope === 'out').map((f) => f.title)).toEqual(['A crit']);
    await ctx.app.close();
  });

  it('(d) a stale intent turns the filter off — out findings are persisted with their scope tag', async () => {
    const a = new MockLLMProvider('openai', { structured: review([finding('A crit')]) });
    const b = new MockLLMProvider('anthropic', {
      structured: review([finding('B crit'), finding('B bug', { severity: 'WARNING', category: 'bug' })]),
    });
    const ctx = await setup({ a, b, stale: true });
    const { runA, runB } = await execute(ctx);
    const o = await outcome(ctx, runA, runB);
    expect(o.findings.filter((f) => f.scope === 'out')).toHaveLength(3);
    expect(o.a.run.status).toBe('done');
    expect(o.b.run.status).toBe('done');
    await ctx.app.close();
  });

  it('(e) while another agent is still computing, a finished agent stays running', async () => {
    const a = new MockLLMProvider('openai', { structured: review([finding('A crit')]) });
    const b = new DelayedLLM('anthropic', { structured: review([]) }, 800);
    const ctx = await setup({ a, b });
    const { runA, runB } = await execute(ctx);
    await new Promise((r) => setTimeout(r, 350));
    const [early] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runA));
    expect(early!.status).toBe('running');
    const o = await outcome(ctx, runA, runB);
    expect(o.a.run.status).toBe('done');
    expect(o.b.run.status).toBe('done');
    await ctx.app.close();
  });
});
