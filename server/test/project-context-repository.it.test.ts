import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { ContextAttachmentsRepository } from '../src/modules/project-context/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('ContextAttachmentsRepository', () => {
  let pg: PgFixture;
  let repo: ContextAttachmentsRepository;
  let workspaceId: string;
  let agentId: string;
  let skillId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const db = pg.handle.db;
    const [agent] = await db.select().from(t.agents).limit(1);
    agentId = agent!.id;
    workspaceId = agent!.workspaceId;
    const [skill] = await db
      .insert(t.skills)
      .values({
        workspaceId,
        name: 'ctx-skill',
        description: '',
        type: 'custom',
        source: 'manual',
        body: 'b',
      })
      .returning();
    skillId = skill!.id;
    repo = new ContextAttachmentsRepository(db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('AC-10/AC-11: replace then read returns the same order', async () => {
    await repo.replaceForAgent(agentId, ['specs/z.md', 'docs/a.md', 'INSIGHTS.md']);
    expect(await repo.pathsForAgent(agentId)).toEqual(['specs/z.md', 'docs/a.md', 'INSIGHTS.md']);
    await repo.replaceForSkill(skillId, ['docs/s2.md', 'docs/s1.md']);
    expect(await repo.pathsForSkills([skillId])).toEqual(
      new Map([[skillId, ['docs/s2.md', 'docs/s1.md']]]),
    );
  });

  it('a second replace drops the old rows', async () => {
    await repo.replaceForAgent(agentId, ['docs/only.md']);
    expect(await repo.pathsForAgent(agentId)).toEqual(['docs/only.md']);
    await repo.replaceForAgent(agentId, []);
    expect(await repo.pathsForAgent(agentId)).toEqual([]);
  });

  it('AC-13: agents.version and skills.version are unchanged after a replace', async () => {
    const db = pg.handle.db;
    const before = {
      a: (await db.select().from(t.agents).where(eq(t.agents.id, agentId)))[0]!.version,
      s: (await db.select().from(t.skills).where(eq(t.skills.id, skillId)))[0]!.version,
    };
    await repo.replaceForAgent(agentId, ['docs/x.md']);
    await repo.replaceForSkill(skillId, ['docs/y.md']);
    const after = {
      a: (await db.select().from(t.agents).where(eq(t.agents.id, agentId)))[0]!.version,
      s: (await db.select().from(t.skills).where(eq(t.skills.id, skillId)))[0]!.version,
    };
    expect(after).toEqual(before);
  });

  it('listForWorkspace returns the rows of this workspace in position order', async () => {
    await repo.replaceForAgent(agentId, ['docs/b.md', 'docs/a.md']);
    const all = await repo.listForWorkspace(workspaceId);
    expect(all.agents.get(agentId)).toEqual(['docs/b.md', 'docs/a.md']);
    expect(all.skills.get(skillId)).toEqual(['docs/y.md']);
  });

  it('AC-14: deleting an agent or a skill removes its rows', async () => {
    const db = pg.handle.db;
    await db.delete(t.agents).where(eq(t.agents.id, agentId));
    await db.delete(t.skills).where(eq(t.skills.id, skillId));
    expect(await db.select().from(t.agentContextDocs)).toEqual([]);
    expect(await db.select().from(t.skillContextDocs)).toEqual([]);
  });
});
