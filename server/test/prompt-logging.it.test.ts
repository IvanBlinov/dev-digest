import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { intentMockLlm } from './helpers/intent-mocks.js';
import { buildApp } from '../src/app.js';
import { loadConfig, type AppConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockEmbedder, MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { ReviewService } from '../src/modules/reviews/service.js';
import { IntentService } from '../src/modules/intent/service.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = (over: Partial<AppConfig> = {}) => ({
  ...loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
  ...over,
});

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const BODY_MARKER = 'BODY-MARKER-TEXT';
const CLEAN_REVIEW = { verdict: 'approve', summary: 'ok', score: 100, findings: [] };
const MARKERS = [BODY_MARKER, 'stripeKey', 'sk_live_xxx', 'ISSUE-SECRET-TEXT', 'URLQUERYSECRET'];

type Line = { obj: Record<string, unknown>; msg?: string };

function capture() {
  const lines: Line[] = [];
  const push = (obj: unknown, msg?: string) => lines.push({ obj: obj as Record<string, unknown>, msg });
  return { lines, logger: { info: push, warn: push, error: push, debug: push } };
}

const assembled = (lines: Line[]) => lines.filter((l) => l.msg === 'prompt.assembled').map((l) => l.obj);

d('prompt.assembled logging', () => {
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
    const name = `plog-${seq++}`;
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
        body: `Fixes #471. ${BODY_MARKER} https://linear.app/x/issue/ABC-1?token=URLQUERYSECRET`,
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

  const makeApp = (cfg: AppConfig = config(), github = new MockGitHubClient()) =>
    buildApp({
      config: cfg,
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        github,
        llm: { openai: new MockLLMProvider('openai', { structured: CLEAN_REVIEW }), openrouter: intentMockLlm() },
      },
    });

  async function twoAgents(app: Awaited<ReturnType<typeof makeApp>>) {
    const names = [`PL Agent A ${seq++}`, `PL Agent B ${seq++}`];
    for (const name of names) {
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'review' },
      });
    }
    const all = await pg.handle.db.select().from(t.agents);
    return all.filter((a) => names.includes(a.name));
  }

  async function execute(cfg?: AppConfig) {
    const pr = await setupPr();
    const app = await makeApp(cfg);
    const agents = await twoAgents(app);
    const cap = capture();
    const { runs } = await new ReviewService(app.container).runReview(workspaceId, pr.id, agents, cap.logger);
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });
    return { app, pr, runs, cap };
  }

  it('review execution: one event per agent, one shared correlationId, also in each trace; no content leaks', async () => {
    const { app, runs, cap } = await execute();
    const events = assembled(cap.lines);
    const review = events.filter((e) => e.promptKind === 'review');
    expect(review).toHaveLength(2);
    expect(events.filter((e) => e.promptKind === 'intent')).toHaveLength(1);
    const ids = new Set(events.map((e) => e.correlationId));
    expect(ids.size).toBe(1);
    const [cid] = [...ids] as string[];
    for (const e of review) {
      expect(e.model).toBe('gpt-4.1');
      expect((e.sections as { name: string }[]).map((s) => s.name)).toContain('diff');
      expect(e).not.toHaveProperty('diffFiles');
    }
    for (const r of runs) {
      const trace = (await app.inject({ method: 'GET', url: `/runs/${r.run_id}/trace` })).json();
      expect(trace.config.correlation_id).toBe(cid);
      expect(trace.log.some((l: { msg: string }) => l.msg.startsWith('Prompt: '))).toBe(true);
      expect(JSON.stringify(trace.log)).not.toContain('"sections"');
    }
    expect(JSON.stringify(cap.lines)).not.toContain('"preview"');
    for (const m of MARKERS) expect(JSON.stringify(cap.lines)).not.toContain(m);
    await app.close();
  });

  it('verbose adds previews/digests but still no content', async () => {
    const { app, cap } = await execute(config({ promptLogVerbose: true }));
    const all = JSON.stringify(cap.lines);
    expect(all).toContain('"preview"');
    expect(all).toContain('"sha256"');
    for (const m of MARKERS) expect(all).not.toContain(m);
    await app.close();
  });

  it('detect: intent event carries the given correlationId and an issue section, no content', async () => {
    const pr = await setupPr();
    const github = new MockGitHubClient({
      issues: { 471: { number: 471, title: 'Rate limit public API', body: 'ISSUE-SECRET-TEXT body', state: 'open' } },
    });
    const app = await makeApp(config(), github);
    const cap = capture();
    await new IntentService(app.container).detect(workspaceId, pr.id, cap.logger, 'req-42');
    const events = assembled(cap.lines);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ promptKind: 'intent', correlationId: 'req-42', promptVersion: 'intent-v1' });
    const names = (events[0]!.sections as { name: string }[]).map((x) => x.name);
    expect(names).toContain('system:intent');
    expect(names).toContain('issue:#471');
    const all = JSON.stringify(cap.lines);
    for (const m of MARKERS) expect(all).not.toContain(m);
    // the existing canonical-by-test log keeps its shape and gains the correlation id
    expect(cap.lines.find((l) => l.msg === 'intent: classifying')?.obj.correlationId).toBe('req-42');
    await app.close();
  });
});
