import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { OnboardingRepository } from '../src/modules/onboarding/repository.js';
import { makeTour } from './helpers/onboarding-fixtures.js';

const hasDocker = await dockerAvailable();
const d = hasDocker || process.env.TEST_DATABASE_URL ? describe : describe.skip;

if (!hasDocker && !process.env.TEST_DATABASE_URL) {
  // eslint-disable-next-line no-console
  console.warn('[onboarding-repository] Docker not available — skipping integration tests.');
}

/**
 * L05b S11 (red phase) — onboarding repository over a real Postgres.
 *
 * Pinned interface (see the test report, "Needs from implementer"):
 *   new OnboardingRepository(db)
 *   get(repoId)                      -> the `onboarding` row (repoId, status, json, startedAt, lastError, ...) | undefined
 *   startIfIdle(repoId)              -> the row (status 'generating', started_at set, any stored json kept) | undefined when one is running
 *   finishSuccess(repoId, tour)      -> stores the tour as the repo's only row, status = tour.status
 *   finishFailure(repoId, reason, skeleton | null)
 *   failStale(olderThanMs)           -> number of rows turned into failed / interrupted
 */
d('onboarding repository (L05b)', () => {
  let pg: PgFixture;
  let repo: OnboardingRepository;
  let workspaceId: string;
  let n = 0;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    repo = new OnboardingRepository(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function newRepo(): Promise<string> {
    n += 1;
    const [row] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: `onb-${n}`, fullName: `acme/onb-${n}` })
      .returning();
    return row!.id;
  }

  const rowsOf = (repoId: string) => pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId));

  it('AC-4: two concurrent startIfIdle → exactly one row with status generating, the other returns undefined', async () => {
    const repoId = await newRepo();
    const results = await Promise.all([repo.startIfIdle(repoId), repo.startIfIdle(repoId)]);
    expect(results.filter((r) => r !== undefined)).toHaveLength(1);
    const rows = await rowsOf(repoId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('generating');
    expect(rows[0]!.startedAt).toBeInstanceOf(Date);
    // a later attempt is refused while it is still running
    expect(await repo.startIfIdle(repoId)).toBeUndefined();
  });

  it('AC-8: finishSuccess stores the tour as the only row', async () => {
    const repoId = await newRepo();
    expect(await repo.startIfIdle(repoId)).toBeDefined();
    const tour = makeTour({ status: 'partial', index_sha: 'abc' });
    await repo.finishSuccess(repoId, tour as never);
    const rows = await rowsOf(repoId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('partial');
    expect(rows[0]!.json).toEqual(tour);
    expect(rows[0]!.lastError).toBeNull();
    // a second success replaces it — still one row
    const next = makeTour({ status: 'ready', index_sha: 'def' });
    await repo.startIfIdle(repoId);
    await repo.finishSuccess(repoId, next as never);
    const after = await rowsOf(repoId);
    expect(after).toHaveLength(1);
    expect((after[0]!.json as { index_sha: string }).index_sha).toBe('def');
    expect((await repo.get(repoId))!.status).toBe('ready');
  });

  it('AC-9: a failure after a stored ready/partial tour keeps the tour unchanged, sets status failed and last_error {reason, at}', async () => {
    const repoId = await newRepo();
    const stored = makeTour({ status: 'ready' });
    await repo.startIfIdle(repoId);
    await repo.finishSuccess(repoId, stored as never);

    const started = await repo.startIfIdle(repoId);
    expect(started).toBeDefined(); // a finished tour does not block a new run
    expect(started!.status).toBe('generating');
    expect(started!.json).toEqual(stored); // the previous tour stays readable while regenerating

    const skeleton = makeTour({ status: 'skeleton', reasons: ['llm_error'] });
    await repo.finishFailure(repoId, 'llm_error', skeleton as never);

    const row = (await repo.get(repoId))!;
    expect(row.status).toBe('failed');
    expect(row.json).toEqual(stored);
    const lastError = row.lastError as { reason: string; at: string };
    expect(lastError.reason).toBe('llm_error');
    expect(Number.isNaN(Date.parse(lastError.at))).toBe(false);
  });

  it('AC-10: a failure with no stored tour stores the skeleton and status skeleton with last_error', async () => {
    const repoId = await newRepo();
    await repo.startIfIdle(repoId);
    const skeleton = makeTour({ status: 'skeleton', reasons: ['no_api_key'] });
    await repo.finishFailure(repoId, 'no_api_key', skeleton as never);

    const row = (await repo.get(repoId))!;
    expect(row.status).toBe('skeleton');
    expect(row.json).toEqual(skeleton);
    expect((row.lastError as { reason: string }).reason).toBe('no_api_key');
  });

  it('AC-7: failStale(600000) turns a generating row with started_at 11 min ago into failed / interrupted, keeping any tour', async () => {
    const withTour = await newRepo();
    const stored = makeTour({ status: 'partial' });
    await pg.handle.db.insert(t.onboarding).values({
      repoId: withTour,
      status: 'generating',
      json: stored,
      startedAt: new Date(Date.now() - 11 * 60_000),
    } as never);

    const noTour = await newRepo();
    await pg.handle.db.insert(t.onboarding).values({
      repoId: noTour,
      status: 'generating',
      json: null,
      startedAt: new Date(Date.now() - 11 * 60_000),
    } as never);

    const fresh = await newRepo();
    await repo.startIfIdle(fresh);

    const changed = await repo.failStale(600_000);
    expect(changed).toBeGreaterThanOrEqual(2);

    const a = (await repo.get(withTour))!;
    expect(a.status).toBe('failed');
    expect(a.json).toEqual(stored);
    expect((a.lastError as { reason: string }).reason).toBe('interrupted');

    const b = (await repo.get(noTour))!;
    expect(b.status).toBe('failed');
    expect(b.json).toBeNull();
    expect((b.lastError as { reason: string }).reason).toBe('interrupted');

    // a generation that is still within the window is left alone
    expect((await repo.get(fresh))!.status).toBe('generating');
    // and a failed row no longer blocks a new run
    expect(await repo.startIfIdle(withTour)).toBeDefined();
  });
});
