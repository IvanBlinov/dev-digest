import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { SmartDiffResponse } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';

const hasDocker = (await dockerAvailable()) || !!process.env.TEST_DATABASE_URL;
const d = hasDocker ? describe : describe.skip;

d('GET /pulls/:id/smart-diff', () => {
  let pg: PgFixture;
  let prId: string;
  let workspaceId: string;
  const llm = new MockLLMProvider('openai');

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [pr] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.number, 482));
    prId = pr!.id;
    workspaceId = pr!.workspaceId;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient(), llm: { openrouter: llm } },
    });
  }
  async function get(id = prId) {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/pulls/${id}/smart-diff` });
    await app.close();
    return res;
  }
  const allLines = (body: SmartDiffResponse) => body.groups.flatMap((g) => g.files.flatMap((f) => f.finding_lines));
  const linesOf = (body: SmartDiffResponse, path: string) =>
    body.groups.flatMap((g) => g.files).find((f) => f.path === path)?.finding_lines;

  async function addReview(agentId: string, createdAt: Date, rows: { file: string; line: number; dismissed?: boolean }[]) {
    const [review] = await pg.handle.db
      .insert(t.reviews)
      .values({ workspaceId, prId, agentId, kind: 'review', verdict: 'comment', summary: 's', score: 50, model: 'm', createdAt })
      .returning();
    if (rows.length === 0) return review!;
    await pg.handle.db.insert(t.findings).values(
      rows.map((r) => ({
        reviewId: review!.id,
        file: r.file,
        startLine: r.line,
        endLine: r.line,
        severity: 'WARNING',
        category: 'bug',
        title: 't',
        rationale: 'r',
        confidence: 0.9,
        dismissedAt: r.dismissed ? new Date() : null,
      })),
    );
    return review!;
  }

  it('seeded PR #482 groups into all five roles with line-anchored findings', async () => {
    const body = SmartDiffResponse.parse((await get()).json());
    expect(body.groups.map((g) => g.role)).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
    const files = body.groups.flatMap((g) => g.files);
    expect(files).toHaveLength(9);
    expect(files.reduce((n, f) => n + f.additions, 0)).toBe(247);
    expect(files.reduce((n, f) => n + f.deletions, 0)).toBe(38);
    expect(body.groups.find((g) => g.role === 'boilerplate')!.files.map((f) => f.path)).toEqual(['pnpm-lock.yaml']);
    expect(linesOf(body, 'src/config.ts')).toEqual([12]);
    expect(linesOf(body, 'src/api/users.ts')).toEqual([45]);

    // the stored patches carry those lines on the new side
    const rows = await pg.handle.db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
    const raw = (path: string) => rows.find((r) => r.path === path)!.patch!;
    const newLines = (path: string) =>
      parseUnifiedDiff(`diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n${raw(path)}`).files[0]!.hunks.flatMap(
        (h) => h.newLineNumbers,
      );
    expect(newLines('src/config.ts')).toContain(12);
    expect(newLines('src/api/users.ts')).toContain(45);
  });

  it('works before any review: valid response, empty finding_lines, no LLM call', async () => {
    await pg.handle.db.delete(t.reviews).where(eq(t.reviews.prId, prId)); // cascades to findings
    const res = await get();
    expect(res.statusCode).toBe(200);
    const body = SmartDiffResponse.parse(res.json());
    expect(allLines(body)).toEqual([]);
    expect(body.groups.length).toBeGreaterThan(0);
    expect(llm.calls.length).toBe(0);
  });

  it('lists active findings of the newest review per agent; dismissed and older reviews are ignored', async () => {
    const agentA = randomUUID();
    const agentB = randomUUID();
    await addReview(agentA, new Date('2026-01-01'), [{ file: 'src/config.ts', line: 99 }]); // older run of A
    await addReview(agentA, new Date('2026-02-01'), [
      { file: 'src/config.ts', line: 12 },
      { file: 'src/api/users.ts', line: 45, dismissed: true },
    ]);
    await addReview(agentB, new Date('2026-02-01'), [{ file: 'src/config.ts', line: 3 }]);
    const body = SmartDiffResponse.parse((await get()).json());
    expect(linesOf(body, 'src/config.ts')).toEqual([3, 12]);
    expect(linesOf(body, 'src/api/users.ts')).toEqual([]);
    expect(llm.calls.length).toBe(0);
  });

  it('a summary-kind review never contributes lines', async () => {
    const [summary] = await pg.handle.db
      .insert(t.reviews)
      .values({ workspaceId, prId, agentId: randomUUID(), kind: 'summary', createdAt: new Date('2027-01-01') })
      .returning();
    await pg.handle.db.insert(t.findings).values({
      reviewId: summary!.id, file: 'src/config.ts', startLine: 77, endLine: 77, severity: 'WARNING',
      category: 'bug', title: 't', rationale: 'r', confidence: 0.9,
    });
    const body = SmartDiffResponse.parse((await get()).json());
    expect(linesOf(body, 'src/config.ts')).not.toContain(77);
  });

  it('unknown PR id gives 404', async () => {
    expect((await get(randomUUID())).statusCode).toBe(404);
  });
});
