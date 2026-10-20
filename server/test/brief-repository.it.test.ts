import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { PrBrief } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { BriefRepository } from '../src/modules/brief/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const brief = (summary: string): PrBrief => ({
  summary,
  risks: [],
  review_focus: [],
  head_sha: 'abc',
  generated_at: '2026-10-19T10:00:00.000Z',
  prompt_version: 'brief-v1',
  input_hash: 'h',
  provider: 'openrouter',
  model: 'm',
  tokens_in: 1,
  tokens_out: 1,
  cost_usd: null,
  duration_ms: 1,
  attempts: 1,
  inputs: [],
  dropped: { risks: 0, review_focus: 0 },
});

d('BriefRepository', () => {
  let pg: PgFixture;
  let prId: string;
  let repo: BriefRepository;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [pr] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.number, 482));
    prId = pr!.id;
    repo = new BriefRepository(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const rows = () => pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));

  it('get returns null when nothing is stored', async () => {
    expect(await repo.get(prId)).toBeNull();
  });

  it('AC-9: replace twice leaves one row holding the second value', async () => {
    await repo.replace(prId, brief('first'));
    await repo.replace(prId, brief('second'));
    expect(await rows()).toHaveLength(1);
    expect((await repo.get(prId))?.summary).toBe('second');
  });

  it('AC-7 / R8: an unparseable json row reads as null', async () => {
    await pg.handle.db.update(t.prBrief).set({ json: { intent: 'old shape' } }).where(eq(t.prBrief.prId, prId));
    expect(await repo.get(prId)).toBeNull();
  });

  it('EC-23: deleting the PR removes the brief row', async () => {
    await repo.replace(prId, brief('x'));
    await pg.handle.db.delete(t.pullRequests).where(eq(t.pullRequests.id, prId));
    expect(await rows()).toHaveLength(0);
  });
});
