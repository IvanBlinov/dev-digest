import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';

const hasDocker = (await dockerAvailable()) || !!process.env.TEST_DATABASE_URL;
const d = hasDocker ? describe : describe.skip;

/** The 4 files an older seed wrote for PR #482 (no patches). */
const OLD_SEED_PATHS = ['src/middleware/ratelimit.ts', 'src/api/public/webhooks.ts', 'src/config.ts', 'src/api/users.ts'];

d('seed tops up PR #482 files on an existing dev DB', () => {
  let pg: PgFixture;
  let prId: string;

  const files = () => pg.handle.db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));

  /** Put PR #482 back into the state an older seed left it in. */
  async function downgradeToOldSeed() {
    const rows = await files();
    const extra = rows.filter((r) => !OLD_SEED_PATHS.includes(r.path)).map((r) => r.id);
    if (extra.length) await pg.handle.db.delete(t.prFiles).where(inArray(t.prFiles.id, extra));
    await pg.handle.db.update(t.prFiles).set({ patch: null }).where(eq(t.prFiles.prId, prId));
  }

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [pr] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.number, 482));
    prId = pr!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('adds the missing files (incl. pnpm-lock.yaml) and restores patches, without duplicates', async () => {
    await downgradeToOldSeed();
    expect(await files()).toHaveLength(4);

    await seed(pg.handle.db);

    const rows = await files();
    expect(rows).toHaveLength(9);
    expect(new Set(rows.map((r) => r.path)).size).toBe(9);
    expect(rows.map((r) => r.path)).toContain('pnpm-lock.yaml');
    expect(rows.find((r) => r.path === 'src/config.ts')!.patch).toContain('stripeKey');
    expect(rows.find((r) => r.path === 'pnpm-lock.yaml')!.patch).toMatch(/^@@ /);
  });

  it('is idempotent and leaves seeded findings alone', async () => {
    const findingsBefore = await pg.handle.db.select().from(t.findings);
    await seed(pg.handle.db);
    await seed(pg.handle.db);
    expect(await files()).toHaveLength(9);
    expect(await pg.handle.db.select().from(t.findings)).toHaveLength(findingsBefore.length);
  });

  it('does not touch a PR #482 that was synced from GitHub (head SHA is not the seed one)', async () => {
    await downgradeToOldSeed();
    await pg.handle.db
      .update(t.pullRequests)
      .set({ headSha: 'realsha000000' })
      .where(and(eq(t.pullRequests.id, prId)));

    await seed(pg.handle.db);

    expect(await files()).toHaveLength(4);
    expect((await files()).every((r) => r.patch === null)).toBe(true);
  });
});
