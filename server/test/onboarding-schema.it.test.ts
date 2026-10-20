import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker || process.env.TEST_DATABASE_URL ? describe : describe.skip;

/** L05b S3 — storage shape of the extended `onboarding` table. */
d('onboarding schema (L05b)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function newRepo(name: string): Promise<string> {
    const [row] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    return row!.id;
  }

  it("AC-8: a row with status 'generating' and json null can be inserted", async () => {
    const repoId = await newRepo('onb-schema-a');
    await pg.handle.db.insert(t.onboarding).values({ repoId, status: 'generating', startedAt: new Date() });
    const [row] = await pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId));
    expect(row).toMatchObject({ status: 'generating', json: null, lastError: null, promptVersion: null, indexSha: null });
    expect(row!.startedAt).toBeInstanceOf(Date);
  });

  it('AC-8: status defaults to none', async () => {
    const repoId = await newRepo('onb-schema-b');
    await pg.handle.db.insert(t.onboarding).values({ repoId });
    const [row] = await pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId));
    expect(row!.status).toBe('none');
  });

  it('AC-13: deleting the repo deletes its onboarding row', async () => {
    const repoId = await newRepo('onb-schema-c');
    await pg.handle.db.insert(t.onboarding).values({ repoId, status: 'ready', json: { a: 1 } });
    await pg.handle.db.delete(t.repos).where(eq(t.repos.id, repoId));
    const rows = await pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId));
    expect(rows).toHaveLength(0);
  });
});
