import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { Container } from '../src/platform/container.js';
import { loadConfig } from '../src/platform/config.js';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';

const hasDocker = await dockerAvailable();
const d = hasDocker || process.env.TEST_DATABASE_URL ? describe : describe.skip;

/** L05b S6 — facade reads the onboarding generator builds on. */
d('repo-intel onboarding reads (L05b)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let n = 0;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function svc(env: Record<string, string> = {}) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test', ...env } as NodeJS.ProcessEnv);
    return new RepoIntelService(new Container(config, pg.handle.db, {}));
  }

  async function newRepo(): Promise<string> {
    n += 1;
    const [row] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: `ri-${n}`, fullName: `acme/ri-${n}` })
      .returning();
    return row!.id;
  }

  async function seedGraph(repoId: string) {
    const rank = (filePath: string, r: number) => ({ repoId, filePath, pagerank: r, hotness: 0, rank: r, percentile: 50 });
    await pg.handle.db.insert(t.fileRank).values([rank('b.ts', 0.5), rank('a.ts', 0.5), rank('c.ts', 0.9)]);
    await pg.handle.db.insert(t.fileEdges).values([
      { repoId, fromFile: 'c.ts', toFile: 'a.ts' },
      { repoId, fromFile: 'a.ts', toFile: 'b.ts' },
    ]);
    await pg.handle.db.insert(t.fileFacts).values([
      { repoId, filePath: 'c.ts', endpoints: ['GET /x'], crons: [] },
      { repoId, filePath: 'a.ts', endpoints: [], crons: ['0 * * * *'] },
    ]);
  }

  it('AC-35: files ordered by rank desc, ties by path asc', async () => {
    const repoId = await newRepo();
    await seedGraph(repoId);
    const g = await svc().getOnboardingGraph(repoId);
    expect(g.files.map((f) => f.path)).toEqual(['c.ts', 'a.ts', 'b.ts']);
    expect(g.files[0]).toEqual({ path: 'c.ts', rank: 0.9 });
    expect(g.edges).toHaveLength(2);
    expect(g.edges).toContainEqual({ from: 'c.ts', to: 'a.ts' });
  });

  it('AC-35: getAllFileFacts returns endpoints and crons per file', async () => {
    const repoId = await newRepo();
    await seedGraph(repoId);
    const facts = await svc().getAllFileFacts(repoId);
    expect(facts.find((f) => f.path === 'c.ts')).toEqual({ path: 'c.ts', endpoints: ['GET /x'], crons: [] });
    expect(facts.find((f) => f.path === 'a.ts')).toEqual({ path: 'a.ts', endpoints: [], crons: ['0 * * * *'] });
  });

  it('AC-44: flag off returns empty graph', async () => {
    const repoId = await newRepo();
    await seedGraph(repoId);
    const off = svc({ REPO_INTEL_ENABLED: 'false' });
    expect(await off.getOnboardingGraph(repoId)).toEqual({ files: [], edges: [] });
    expect(await off.getAllFileFacts(repoId)).toEqual([]);
  });

  it('AC-45: index state exposes filesTotal and bounded from stats', async () => {
    const repoId = await newRepo();
    await pg.handle.db.insert(t.repoIndexState).values({
      repoId,
      lastIndexedSha: 'sha1',
      indexerVersion: 1,
      status: 'partial',
      filesIndexed: 100,
      stats: { totalCandidates: 120, bounded: 20 },
    });
    const state = await svc().getIndexState(repoId);
    expect(state.filesTotal).toBe(120);
    expect(state.bounded).toBe(20);
  });

  it('AC-45: index state without stats leaves filesTotal null and bounded 0', async () => {
    const repoId = await newRepo();
    await pg.handle.db.insert(t.repoIndexState).values({
      repoId, lastIndexedSha: 'sha1', indexerVersion: 1, status: 'full', filesIndexed: 3,
    });
    const state = await svc().getIndexState(repoId);
    expect(state.filesTotal).toBeNull();
    expect(state.bounded).toBe(0);
  });
});
