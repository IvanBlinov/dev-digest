import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { IntentService } from '../src/modules/intent/service.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[intent] Docker not available — skipping integration tests.');
}

const LONG_BODY =
  'Fixes #471. Adds a token-bucket rate limiter to the public API so unauthenticated clients cannot abuse it.';

d('GET/POST /pulls/:id/intent', () => {
  let pg: PgFixture;
  let prId: string;
  const github = new MockGitHubClient({
    issues: { 471: { number: 471, title: 'Rate limit public API', body: 'ISSUE-SECRET-TEXT body', state: 'open' } },
  });
  const llm = new MockLLMProvider('openai', {
    structuredBySchema: {
      IntentClassification: {
        summary: 'Add a rate limiter to the public API',
        in_scope: ['rate limiter'],
        out_of_scope: ['billing'],
        confidence: 'high',
        missing_context: [],
      },
    },
  });

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    await seed(pg.handle.db); // idempotent: the seeded intent must not be duplicated or overwritten
    const [pr] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.number, 482));
    prId = pr!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github, llm: { openrouter: llm } },
    });
  }
  const setPr = (v: Partial<typeof t.pullRequests.$inferInsert>) =>
    pg.handle.db.update(t.pullRequests).set(v).where(eq(t.pullRequests.id, prId));
  const classifierCalls = () => llm.calls.filter((c) => c.method === 'completeStructured');

  it('the seeded PR #482 intent is fresh (not stale) — the e2e flow relies on it', async () => {
    const app = await makeApp();
    const { intent } = (await app.inject({ method: 'GET', url: `/pulls/${prId}/intent` })).json();
    expect(intent).toMatchObject({ confidence: 'medium', stale: false, stale_reason: null });
    expect(intent.summary).toContain('token-bucket rate limiting');
    await app.close();
    // the remaining cases start from a PR without a stored intent
    await pg.handle.db.delete(t.prIntent).where(eq(t.prIntent.prId, prId));
  });

  it('GET before detection → { intent: null }', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/pulls/${prId}/intent` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ intent: null });
    await app.close();
  });

  it('POST classifies with the review_intent model and stores metadata; hunk bodies never reach the LLM (AC1/AC2)', async () => {
    await setPr({ body: LONG_BODY });
    const app = await makeApp();
    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/intent` });
    expect(res.statusCode).toBe(200);
    const { intent } = res.json();
    expect(intent).toMatchObject({
      pr_id: prId,
      summary: 'Add a rate limiter to the public API',
      provider: 'openrouter',
      model: 'openai/gpt-4.1-mini',
      prompt_version: 'intent-v1',
      tokens_in: 100,
      tokens_out: 50,
      cost_usd: 0.001,
      stale: false,
      stale_reason: null,
    });
    expect(intent.sources).toContainEqual({ kind: 'issue', ref: '#471', status: 'ok', truncated: false });
    expect(intent.confidence).toBe('high');

    const call = classifierCalls().at(-1)!.req as { model: string; messages: { content: string }[]; schemaName: string };
    expect(call.model).toBe('openai/gpt-4.1-mini');
    expect(call.schemaName).toBe('IntentClassification');
    const sent = call.messages.map((m) => m.content).join('\n');
    expect(sent).toContain('@@ -10,3 +10,4 @@');
    expect(sent).toContain('src/config.ts');
    expect(sent).toContain('ISSUE-SECRET-TEXT');
    expect(sent).not.toContain('stripeKey');
    expect(sent).not.toContain('sk_live_xxx');

    const get = await app.inject({ method: 'GET', url: `/pulls/${prId}/intent` });
    expect(get.json().intent.summary).toBe('Add a rate limiter to the public API');
    await app.close();
  });

  it('an unreachable spec link → one missing item and confidence capped at medium (AC5)', async () => {
    await setPr({ body: `${LONG_BODY} See specs/missing.md for the design.` });
    const app = await makeApp();
    const { intent } = (await app.inject({ method: 'POST', url: `/pulls/${prId}/intent` })).json();
    expect(intent.sources).toContainEqual({ kind: 'spec', ref: 'specs/missing.md', status: 'not_found' });
    expect(intent.missing_context).toHaveLength(1);
    expect(intent.missing_context[0]).toContain('specs/missing.md');
    expect(intent.confidence).toBe('medium');
    await app.close();
  });

  it('an empty body → low confidence, title/files/headers still sent (AC4)', async () => {
    await setPr({ body: '' });
    const app = await makeApp();
    const { intent } = (await app.inject({ method: 'POST', url: `/pulls/${prId}/intent` })).json();
    expect(intent.confidence).toBe('low');
    const sent = (classifierCalls().at(-1)!.req as { messages: { content: string }[] }).messages
      .map((m) => m.content)
      .join('\n');
    expect(sent).toContain('(empty)');
    expect(sent).toContain('Add rate limiting to public API endpoints'.slice(0, 20));
    expect(sent).toContain('@@ -10,3 +10,4 @@');
    await app.close();
  });

  it('turns stale when the head SHA or the description changes (AC3)', async () => {
    await setPr({ body: LONG_BODY });
    const app = await makeApp();
    await app.inject({ method: 'POST', url: `/pulls/${prId}/intent` });
    const fresh = (await app.inject({ method: 'GET', url: `/pulls/${prId}/intent` })).json().intent;
    expect(fresh.stale).toBe(false);

    await setPr({ headSha: 'moved-head-sha' });
    const moved = (await app.inject({ method: 'GET', url: `/pulls/${prId}/intent` })).json().intent;
    expect(moved).toMatchObject({ stale: true, stale_reason: 'head_moved' });

    await app.inject({ method: 'POST', url: `/pulls/${prId}/intent` });
    await setPr({ body: 'rewritten description' });
    const edited = (await app.inject({ method: 'GET', url: `/pulls/${prId}/intent` })).json().intent;
    expect(edited).toMatchObject({ stale: true, stale_reason: 'description_changed' });
    await app.close();
  });

  it('unknown PR → 404', async () => {
    const app = await makeApp();
    const id = '00000000-0000-4000-8000-000000000000';
    expect((await app.inject({ method: 'GET', url: `/pulls/${id}/intent` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/pulls/${id}/intent` })).statusCode).toBe(404);
    await app.close();
  });

  it('logs carry sizes, sources and statuses — never body, issue text, hunk bodies or URL queries (AC11)', async () => {
    await setPr({
      body: `${LONG_BODY} Context https://linear.app/x/issue/ABC-1?token=URLQUERYSECRET and BODY-MARKER-TEXT`,
    });
    const app = await makeApp();
    const lines: { obj: unknown; msg?: string }[] = [];
    const log = {
      info: (obj: unknown, msg?: string) => lines.push({ obj, msg }),
      warn: (obj: unknown, msg?: string) => lines.push({ obj, msg }),
      error: (obj: unknown, msg?: string) => lines.push({ obj, msg }),
      debug: (obj: unknown, msg?: string) => lines.push({ obj, msg }),
    };
    const [pr] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.id, prId));
    await new IntentService(app.container).detect(pr!.workspaceId, prId, log);

    const all = JSON.stringify(lines);
    expect(all).toContain('components');
    expect(all).toContain('sources');
    expect(all).toContain('openai/gpt-4.1-mini');
    expect(all).toContain('intent-v1');
    expect(all).toContain('linear.app/x/issue/ABC-1');
    for (const secret of ['BODY-MARKER-TEXT', 'ISSUE-SECRET-TEXT', 'URLQUERYSECRET', 'sk_live_xxx', 'stripeKey', 'Rate limit public API']) {
      expect(all).not.toContain(secret);
    }
    await app.close();
  });
});
