import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { intentMockLlm } from './helpers/intent-mocks.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockEmbedder, MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';

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

const CLEAN_REVIEW = { verdict: 'approve', summary: 'ok', score: 100, findings: [] };

class FailingLLM extends MockLLMProvider {
  override async completeStructured<T>(): Promise<never> {
    throw new Error('classifier exploded with PR-BODY-TEXT');
  }
}

/**
 * Review runs load or auto-classify the PR intent and inject it into every
 * agent's prompt (filter still off here — see reviews-scope-signal.it.test.ts).
 * GitHub and OpenRouter are mocked: nothing reaches the network.
 */
d('review run + PR intent', () => {
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

  async function setupPr() {
    const db = pg.handle.db;
    const name = `intent-api-${seq++}`;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
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
    return pr!;
  }

  function makeApp(intentLlm: MockLLMProvider, reviewLlm = new MockLLMProvider('openai', { structured: CLEAN_REVIEW })) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        github: new MockGitHubClient(),
        llm: { openai: reviewLlm, openrouter: intentLlm },
      },
    });
  }

  async function runReview(app: Awaited<ReturnType<typeof makeApp>>, prId: string) {
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: `Intent Agent ${seq++}`, provider: 'openai', model: 'gpt-4.1', system_prompt: 'review' },
      })
    ).json();
    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/review`, payload: { agentId: agent.id } });
    expect(res.statusCode).toBe(200);
    const runId = res.json().runs[0].run_id as string;
    const runs = await waitForPrRuns(pg.handle.db, prId, { expected: 1 });
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    return { run: runs.find((r) => r.id === runId)!, trace, logs: (trace.log as { msg: string }[]).map((l) => l.msg) };
  }

  const calls = (llm: MockLLMProvider) => llm.calls.filter((c) => c.method === 'completeStructured').length;

  it('(a) no stored intent → classified once before the agents, injected, logged', async () => {
    const pr = await setupPr();
    const intentLlm = intentMockLlm();
    const app = await makeApp(intentLlm);
    const { run, trace, logs } = await runReview(app, pr.id);
    expect(run.status).toBe('done');
    expect(calls(intentLlm)).toBe(1);
    const rows = await pg.handle.db.select().from(t.prIntent).where(eq(t.prIntent.prId, pr.id));
    expect(rows).toHaveLength(1);
    expect(trace.prompt_assembly.intent).toContain('Add rate limiting to the public API');
    expect(trace.prompt_assembly.user).toContain('## PR intent (unverified hypothesis)');
    expect(logs.some((m) => m.startsWith('Loading PR intent'))).toBe(true);
    await app.close();
  });

  it('(b) a stored fresh intent is reused — the classifier is not called', async () => {
    const pr = await setupPr();
    const intentLlm = intentMockLlm();
    const app = await makeApp(intentLlm);
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` });
    expect(calls(intentLlm)).toBe(1);
    const { run, trace } = await runReview(app, pr.id);
    expect(run.status).toBe('done');
    expect(calls(intentLlm)).toBe(1);
    expect(trace.prompt_assembly.intent).toContain('Add rate limiting to the public API');
    await app.close();
  });

  it('(c) a stale intent is injected as context, logged stale, and not re-classified', async () => {
    const pr = await setupPr();
    const intentLlm = intentMockLlm();
    const app = await makeApp(intentLlm);
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` });
    await pg.handle.db.update(t.pullRequests).set({ headSha: 'moved' }).where(eq(t.pullRequests.id, pr.id));
    const { run, trace, logs } = await runReview(app, pr.id);
    expect(run.status).toBe('done');
    expect(calls(intentLlm)).toBe(1);
    expect(trace.prompt_assembly.intent).toContain('earlier version');
    expect(logs.some((m) => /stale/i.test(m))).toBe(true);
    await app.close();
  });

  it('(d) a failing classifier leaves the review done and logs "Intent unavailable" without leaking text', async () => {
    const pr = await setupPr();
    const app = await makeApp(new FailingLLM('openai'));
    const { run, trace, logs } = await runReview(app, pr.id);
    expect(run.status).toBe('done');
    expect(logs.some((m) => m.includes('Intent unavailable'))).toBe(true);
    expect(JSON.stringify(logs)).not.toContain('PR-BODY-TEXT');
    expect(trace.prompt_assembly.intent ?? null).toBeNull();
    expect(trace.prompt_assembly.user).not.toContain('## PR intent');
    await app.close();
  });

  it("(e) the run's cost excludes the classifier call", async () => {
    const pr = await setupPr();
    const app = await makeApp(intentMockLlm());
    const { run } = await runReview(app, pr.id);
    // MockLLMProvider reports 0.001 per call; only the single review call counts.
    expect(run.costUsd).toBeCloseTo(0.001, 9);
    await app.close();
  });
});
