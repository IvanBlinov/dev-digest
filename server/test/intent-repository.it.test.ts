import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { IntentRepository } from '../src/modules/intent/repository.js';
import { insertFindings, insertReview } from '../src/modules/reviews/repository/review.repo.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[intent-repository] Docker not available — skipping integration tests.');
}

d('IntentRepository + findings.scope', () => {
  let pg: PgFixture;
  let prId: string;
  let workspaceId: string;
  let repo: IntentRepository;

  const values = {
    summary: 'Add rate limiting',
    inScope: ['limiter'],
    outOfScope: ['billing'],
    confidence: 'medium' as const,
    sources: [{ kind: 'issue' as const, ref: '#471', status: 'ok' as const }],
    missingContext: ['spec missing'],
    headSha: 'abc',
    inputHash: 'h1',
    provider: 'openrouter',
    model: 'openai/gpt-4.1-mini',
    promptVersion: 'intent-v1',
    tokensIn: 100,
    tokensOut: 50,
    durationMs: 12,
    costUsd: 0.001,
  };

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [pr] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.number, 482));
    prId = pr!.id;
    workspaceId = pr!.workspaceId;
    repo = new IntentRepository(pg.handle.db);
    // seed() stores a fresh intent for PR #482; start from "none"
    await pg.handle.db.delete(t.prIntent).where(eq(t.prIntent.prId, prId));
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('get on a PR without intent is undefined', async () => {
    expect(await repo.get(prId)).toBeUndefined();
  });

  it('upsert then get round-trips; a second upsert overwrites (one row)', async () => {
    await repo.upsert(prId, values);
    const row = await repo.get(prId);
    expect(row).toMatchObject({
      summary: 'Add rate limiting',
      inScope: ['limiter'],
      sources: [{ kind: 'issue', ref: '#471', status: 'ok' }],
      missingContext: ['spec missing'],
      confidence: 'medium',
      model: 'openai/gpt-4.1-mini',
      promptVersion: 'intent-v1',
      tokensIn: 100,
      costUsd: 0.001,
      headSha: 'abc',
      inputHash: 'h1',
    });
    expect(row!.detectedAt).toBeInstanceOf(Date);
    await repo.upsert(prId, { ...values, summary: 'Second', inputHash: 'h2' });
    expect((await repo.get(prId))!.summary).toBe('Second');
    const all = await pg.handle.db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
    expect(all).toHaveLength(1);
  });

  it('commitMessages returns the first line of each commit message', async () => {
    const msgs = await repo.commitMessages(prId);
    expect(msgs).toContain('Add token-bucket rate limiter');
  });

  it('a finding inserted with scope out reads back out', async () => {
    const review = await insertReview(pg.handle.db, {
      workspaceId,
      prId,
      agentId: null,
      runId: null,
      kind: 'review',
      verdict: 'COMMENT',
      summary: 's',
      score: 50,
      model: 'm',
    });
    const [row] = await insertFindings(pg.handle.db, review.id, [
      {
        id: 'x',
        severity: 'CRITICAL',
        category: 'security',
        title: 't',
        file: 'a.ts',
        start_line: 1,
        end_line: 2,
        rationale: 'r',
        confidence: 0.9,
        scope: 'out',
      },
    ]);
    expect(row!.scope).toBe('out');
  });
});
