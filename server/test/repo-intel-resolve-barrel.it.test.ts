/**
 * resolveReferences follows one hop through an `index.*` barrel.
 *
 * Client code imports components through barrels (`page.tsx` → `Comp/index.ts`
 * → `Comp/Comp.tsx`). The import graph only has the edge to the barrel, so a
 * direct-edge-only resolver left those references with decl_file = NULL and the
 * blast radius showed no callers.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { RepoIntelRepository } from '../src/modules/repo-intel/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('resolveReferences: one hop through an index barrel', () => {
  let pg: PgFixture;
  let repoId: string;
  let repo: RepoIntelRepository;

  const sym = (path: string, name: string) => ({
    repoId,
    path,
    name,
    kind: 'function',
    line: 1,
    endLine: 3,
    exported: true,
    signature: null,
    contentHash: 'h',
  });
  const ref = (fromPath: string, toSymbol: string, line = 10) => ({
    repoId,
    fromPath,
    toSymbol,
    line,
    contentHash: 'h',
  });
  const edge = (fromFile: string, toFile: string) => ({ fromFile, toFile });

  async function declFileOf(fromPath: string, toSymbol: string): Promise<string | null> {
    const [row] = await pg.handle.db
      .select({ declFile: t.references.declFile })
      .from(t.references)
      .where(
        and(
          eq(t.references.repoId, repoId),
          eq(t.references.fromPath, fromPath),
          eq(t.references.toSymbol, toSymbol),
        ),
      );
    return row?.declFile ?? null;
  }

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    const [r] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: ws!.id, owner: 'acme', name: 'barrels', fullName: 'acme/barrels' })
      .returning();
    repoId = r!.id;
    repo = new RepoIntelRepository(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });
  beforeEach(async () => {
    await pg.handle.db.delete(t.references).where(eq(t.references.repoId, repoId));
    await pg.handle.db.delete(t.symbols).where(eq(t.symbols.repoId, repoId));
    await repo.replaceEdges(repoId, []);
  });

  it('resolves page.tsx → Comp via Comp/index.ts to Comp/Comp.tsx', async () => {
    await repo.insertSymbols([sym('src/Comp/Comp.tsx', 'Comp')]);
    await repo.insertReferences([ref('src/page.tsx', 'Comp')]);
    await repo.replaceEdges(repoId, [
      edge('src/page.tsx', 'src/Comp/index.ts'),
      edge('src/Comp/index.ts', 'src/Comp/Comp.tsx'),
    ]);

    await repo.resolveReferences(repoId, { reset: true });

    expect(await declFileOf('src/page.tsx', 'Comp')).toBe('src/Comp/Comp.tsx');
  });

  it('prefers a direct declaration over a barrel hop', async () => {
    await repo.insertSymbols([sym('src/b.ts', 'helper'), sym('src/Lib/helper.ts', 'helper')]);
    await repo.insertReferences([ref('src/page.tsx', 'helper')]);
    await repo.replaceEdges(repoId, [
      edge('src/page.tsx', 'src/b.ts'),
      edge('src/page.tsx', 'src/Lib/index.ts'),
      edge('src/Lib/index.ts', 'src/Lib/helper.ts'),
    ]);

    await repo.resolveReferences(repoId, { reset: true });

    expect(await declFileOf('src/page.tsx', 'helper')).toBe('src/b.ts');
  });

  it('keeps a barrel that declares the name itself as the declaration', async () => {
    await repo.insertSymbols([sym('src/Comp/index.ts', 'Comp'), sym('src/Comp/Comp.tsx', 'Comp')]);
    await repo.insertReferences([ref('src/page.tsx', 'Comp')]);
    await repo.replaceEdges(repoId, [
      edge('src/page.tsx', 'src/Comp/index.ts'),
      edge('src/Comp/index.ts', 'src/Comp/Comp.tsx'),
    ]);

    await repo.resolveReferences(repoId, { reset: true });

    expect(await declFileOf('src/page.tsx', 'Comp')).toBe('src/Comp/index.ts');
  });

  it('leaves an ambiguous hop unresolved (two files behind the barrel declare the name)', async () => {
    await repo.insertSymbols([sym('src/Lib/a.ts', 'dup'), sym('src/Lib/b.ts', 'dup')]);
    await repo.insertReferences([ref('src/page.tsx', 'dup')]);
    await repo.replaceEdges(repoId, [
      edge('src/page.tsx', 'src/Lib/index.ts'),
      edge('src/Lib/index.ts', 'src/Lib/a.ts'),
      edge('src/Lib/index.ts', 'src/Lib/b.ts'),
    ]);

    await repo.resolveReferences(repoId, { reset: true });

    expect(await declFileOf('src/page.tsx', 'dup')).toBeNull();
  });

  it('does not hop through a non-barrel file', async () => {
    await repo.insertSymbols([sym('src/deep.ts', 'deep')]);
    await repo.insertReferences([ref('src/page.tsx', 'deep')]);
    await repo.replaceEdges(repoId, [
      edge('src/page.tsx', 'src/mid.ts'),
      edge('src/mid.ts', 'src/deep.ts'),
    ]);

    await repo.resolveReferences(repoId, { reset: true });

    expect(await declFileOf('src/page.tsx', 'deep')).toBeNull();
  });
});
