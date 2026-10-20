/**
 * GET/POST /pulls/:id/brief (SPEC-03). DB-backed: run with `scripts/it-db.sh run server/test/brief.it.test.ts`.
 * Pins AC-3, AC-6..AC-9, AC-33..AC-36, NFR-1, NFR-3 against the seeded PR #482.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[brief] Docker not available — skipping integration tests.');
}

const MODEL_OUTPUT = {
  summary: 'Adds a rate limiter and wires it into the public API.',
  risks: [
    {
      kind: 'security',
      title: 'Hard-coded key in config',
      explanation: 'A live key was added to src/config.ts.',
      severity: 'high',
      refs: [
        { file: 'src/config.ts', start_line: 12, end_line: 12 },
        { file: 'src/does/not-exist.ts', start_line: 1, end_line: 1 },
      ],
    },
  ],
  review_focus: [
    { file: 'src/config.ts', line: 12, reason: 'secret committed' },
    { file: 'src/does/not-exist.ts', line: 3, reason: 'invented path' },
  ],
};

function structuredLlm() {
  return new MockLLMProvider('openai', { structuredBySchema: { BriefModelOutput: MODEL_OUTPUT } });
}

/** A provider whose structured call blocks until `release()` so a second request can race it. */
class DeferredLlm extends MockLLMProvider {
  private gate!: () => void;
  private opened = new Promise<void>((r) => (this.gate = r));
  release() {
    this.gate();
  }
  override async completeStructured<T>(req: Parameters<MockLLMProvider['completeStructured']>[0]) {
    const pending = super.completeStructured<T>(req as never);
    await this.opened;
    return pending;
  }
}

class ThrowingLlm extends MockLLMProvider {
  override async completeStructured<T>(req: Parameters<MockLLMProvider['completeStructured']>[0]): Promise<never> {
    this.calls.push({ method: 'completeStructured', req });
    throw new Error('RAW_MODEL_OUTPUT_SECRET {"summary":"leak"}');
  }
}

const structuredCalls = (llm: MockLLMProvider) => llm.calls.filter((c) => c.method === 'completeStructured');
const until = async (cond: () => boolean, ms = 3000) => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 10));
  }
};

d('GET/POST /pulls/:id/brief', () => {
  let pg: PgFixture;
  let prId: string;
  let original: { headSha: string; title: string; body: string | null };

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [pr] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.number, 482));
    prId = pr!.id;
    original = { headSha: pr!.headSha, title: pr!.title, body: pr!.body };
  });
  afterAll(async () => {
    await pg?.stop();
  });

  beforeEach(async () => {
    await pg.handle.db.delete(t.prBrief).where(eq(t.prBrief.prId, prId));
    await pg.handle.db.update(t.pullRequests).set(original).where(eq(t.pullRequests.id, prId));
  });

  function makeApp(llm: MockLLMProvider, nodeEnv: 'test' | 'development' = 'test') {
    const config = loadConfig({ ...process.env, NODE_ENV: nodeEnv } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        llm: { openrouter: llm, openai: llm },
      },
    });
  }
  const setPr = (v: Partial<typeof t.pullRequests.$inferInsert>) =>
    pg.handle.db.update(t.pullRequests).set(v).where(eq(t.pullRequests.id, prId));
  const storedRow = async () =>
    (await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId)))[0];

  it('AC-6 / NFR-1: GET with no stored brief returns the empty response and makes no model call', async () => {
    const llm = structuredLlm();
    const app = await makeApp(llm);
    const res = await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ brief: null, stale: false, stale_reason: null });
    expect(llm.calls).toHaveLength(0);
    await app.close();
  });

  it('AC-9 / AC-3: POST generates, stores one row and returns it with stale:false; GET returns the same brief', async () => {
    const llm = structuredLlm();
    const app = await makeApp(llm);
    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.stale).toBe(false);
    expect(body.stale_reason).toBeNull();
    expect(body.brief).toMatchObject({
      summary: MODEL_OUTPUT.summary,
      head_sha: original.headSha,
      attempts: 1,
      provider: 'openrouter',
      model: 'openai/gpt-4.1-mini',
    });
    // post-validation ran: the invented path is gone, the real one stays
    expect(body.brief.risks).toHaveLength(1);
    expect(body.brief.risks[0].refs.map((r: { file: string }) => r.file)).toEqual(['src/config.ts']);
    expect(body.brief.review_focus).toEqual([{ file: 'src/config.ts', line: 12, reason: 'secret committed' }]);
    expect(body.brief.dropped).toEqual({ risks: 0, review_focus: 1 });
    expect(Array.isArray(body.brief.inputs)).toBe(true);
    expect(structuredCalls(llm)).toHaveLength(1);

    const rows = await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));
    expect(rows).toHaveLength(1);

    const get = await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` });
    expect(get.json()).toEqual(body);
    expect(structuredCalls(llm)).toHaveLength(1); // NFR-1: the GET added no call
    await app.close();
  });

  it('AC-9: a second POST replaces the stored brief', async () => {
    const llm = structuredLlm();
    const app = await makeApp(llm);
    const first = (await app.inject({ method: 'POST', url: `/pulls/${prId}/brief` })).json().brief;
    await new Promise((r) => setTimeout(r, 5));
    const second = (await app.inject({ method: 'POST', url: `/pulls/${prId}/brief` })).json().brief;
    expect(second.generated_at >= first.generated_at).toBe(true);
    const rows = await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));
    expect(rows).toHaveLength(1);
    await app.close();
  });

  it('AC-7: stale reasons — head_moved, description_changed, prompt_updated (in that precedence)', async () => {
    const llm = structuredLlm();
    const app = await makeApp(llm);
    await app.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    const get = async () => (await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` })).json();

    expect(await get()).toMatchObject({ stale: false, stale_reason: null });

    await setPr({ body: 'a rewritten description' });
    expect(await get()).toMatchObject({ stale: true, stale_reason: 'description_changed' });

    await setPr({ headSha: 'moved-head-sha' });
    expect(await get()).toMatchObject({ stale: true, stale_reason: 'head_moved' });

    const row = (await storedRow())!;
    await pg.handle.db
      .update(t.prBrief)
      .set({ json: { ...(row.json as object), prompt_version: 'x' } })
      .where(eq(t.prBrief.prId, prId));
    expect(await get()).toMatchObject({ stale: true, stale_reason: 'prompt_updated' });
    await app.close();
  });

  it('AC-7 / R8: a stored row that fails to parse is treated as no brief', async () => {
    await pg.handle.db.insert(t.prBrief).values({ prId, json: { summary: 42 } });
    const llm = structuredLlm();
    const app = await makeApp(llm);
    const res = await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ brief: null, stale: false, stale_reason: null });
    await app.close();
  });

  it('AC-8: an unknown PR id is a 404 on both routes', async () => {
    const llm = structuredLlm();
    const app = await makeApp(llm);
    const id = '00000000-0000-4000-8000-000000000000';
    const get = await app.inject({ method: 'GET', url: `/pulls/${id}/brief` });
    const post = await app.inject({ method: 'POST', url: `/pulls/${id}/brief` });
    expect(get.statusCode).toBe(404);
    expect(post.statusCode).toBe(404);
    expect(get.json().error.code).toBe('not_found');
    expect(llm.calls).toHaveLength(0);
    await app.close();
  });

  it('AC-33 / NFR-1: a PR with no changed files gets 422 brief_no_files and no model call', async () => {
    const files = await pg.handle.db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
    await pg.handle.db.delete(t.prFiles).where(eq(t.prFiles.prId, prId));
    try {
      const llm = structuredLlm();
      const app = await makeApp(llm);
      const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('brief_no_files');
      expect(llm.calls).toHaveLength(0);
      await app.close();
    } finally {
      if (files.length) await pg.handle.db.insert(t.prFiles).values(files);
    }
  });

  it('AC-34 / NFR-1: a second POST while one is running gets 409 brief_in_progress and no extra model call', async () => {
    const llm = new DeferredLlm('openai', { structuredBySchema: { BriefModelOutput: MODEL_OUTPUT } });
    const app = await makeApp(llm);
    const first = app.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    await until(() => structuredCalls(llm).length === 1);

    const second = await app.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('brief_in_progress');
    expect(structuredCalls(llm)).toHaveLength(1);

    llm.release();
    const done = await first;
    expect(done.statusCode).toBe(200);
    expect(structuredCalls(llm)).toHaveLength(1);

    // the lock is released: a later POST goes through
    const again = await app.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    expect(again.statusCode).toBe(200);
    expect(structuredCalls(llm)).toHaveLength(2);
    await app.close();
  });

  it('AC-35: the 7th POST within a minute is 429 rate_limited with details.retry_after_s > 0', async () => {
    const llm = structuredLlm();
    const app = await makeApp(llm, 'development'); // rate limiting is off under NODE_ENV=test
    for (let i = 0; i < 6; i += 1) {
      const ok = await app.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
      expect(ok.statusCode).toBe(200);
    }
    const limited = await app.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    expect(limited.statusCode).toBe(429);
    const err = limited.json().error;
    expect(err.code).toBe('rate_limited');
    expect(err.details.retry_after_s).toBeGreaterThan(0);
    expect(Object.keys(err.details)).toEqual(['retry_after_s']);
    expect(structuredCalls(llm)).toHaveLength(6); // NFR-1: the 429 made no call
    await app.close();
  });

  it('AC-36: a provider failure is a 502, stores nothing, keeps the old brief and leaks no model output', async () => {
    const good = structuredLlm();
    const okApp = await makeApp(good);
    await okApp.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    await okApp.close();
    const before = await storedRow();
    expect(before).toBeDefined();

    const bad = new ThrowingLlm('openai');
    const app = await makeApp(bad);
    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    expect(res.statusCode).toBe(502);
    expect(res.body).not.toContain('RAW_MODEL_OUTPUT_SECRET');
    expect(res.body).not.toContain('leak');
    expect(structuredCalls(bad)).toHaveLength(1);

    const after = await storedRow();
    expect(after!.json).toEqual(before!.json);
    await app.close();
  });

  it('AC-36: a failed first generation stores nothing', async () => {
    const app = await makeApp(new ThrowingLlm('openai'));
    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    expect(res.statusCode).toBe(502);
    expect(await storedRow()).toBeUndefined();
    const get = await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` });
    expect(get.json()).toEqual({ brief: null, stale: false, stale_reason: null });
    await app.close();
  });

  it('NFR-3: p95 of 20 GETs on a stored brief is at most 300 ms', async () => {
    const llm = structuredLlm();
    const app = await makeApp(llm);
    await app.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    const times: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      const t0 = performance.now();
      const res = await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` });
      times.push(performance.now() - t0);
      expect(res.statusCode).toBe(200);
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.ceil(times.length * 0.95) - 1]!;
    expect(p95).toBeLessThanOrEqual(300);
    expect(structuredCalls(llm)).toHaveLength(1); // NFR-1: 20 GETs, still one call
    await app.close();
  });
});
