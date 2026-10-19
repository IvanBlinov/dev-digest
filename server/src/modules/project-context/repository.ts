import { asc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * L05 — data access for the documents attached to agents and skills. Owns
 * `agent_context_docs` and `skill_context_docs`. Ownership (workspace) is checked by
 * the caller through the agents / skills repositories; these tables carry no
 * `workspace_id`, like `agent_skills`. Replacing never touches `agents.version`
 * or `skills.version` (AC-13).
 */
export class ContextAttachmentsRepository {
  constructor(private db: Db) {}

  async pathsForAgent(agentId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.agentContextDocs.path })
      .from(t.agentContextDocs)
      .where(eq(t.agentContextDocs.agentId, agentId))
      .orderBy(asc(t.agentContextDocs.position));
    return rows.map((r) => r.path);
  }

  async pathsForSkill(skillId: string): Promise<string[]> {
    return (await this.pathsForSkills([skillId])).get(skillId) ?? [];
  }

  /** Ordered paths per skill id; a skill without attachments is absent from the map. */
  async pathsForSkills(skillIds: string[]): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    if (skillIds.length === 0) return out;
    const rows = await this.db
      .select()
      .from(t.skillContextDocs)
      .where(inArray(t.skillContextDocs.skillId, skillIds))
      .orderBy(asc(t.skillContextDocs.position));
    for (const r of rows) out.set(r.skillId, [...(out.get(r.skillId) ?? []), r.path]);
    return out;
  }

  /** Replaces the agent's list in one transaction; `position` = index in `paths`. */
  async replaceForAgent(agentId: string, paths: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(t.agentContextDocs).where(eq(t.agentContextDocs.agentId, agentId));
      if (paths.length > 0) {
        await tx
          .insert(t.agentContextDocs)
          .values(paths.map((path, position) => ({ agentId, path, position })));
      }
    });
  }

  async replaceForSkill(skillId: string, paths: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(t.skillContextDocs).where(eq(t.skillContextDocs.skillId, skillId));
      if (paths.length > 0) {
        await tx
          .insert(t.skillContextDocs)
          .values(paths.map((path, position) => ({ skillId, path, position })));
      }
    });
  }

  /** Every attachment of the workspace's agents and skills, joined through the owner. */
  async listForWorkspace(
    workspaceId: string,
  ): Promise<{ agents: Map<string, string[]>; skills: Map<string, string[]> }> {
    const agentRows = await this.db
      .select({ id: t.agentContextDocs.agentId, path: t.agentContextDocs.path })
      .from(t.agentContextDocs)
      .innerJoin(t.agents, eq(t.agents.id, t.agentContextDocs.agentId))
      .where(eq(t.agents.workspaceId, workspaceId))
      .orderBy(asc(t.agentContextDocs.position));
    const skillRows = await this.db
      .select({ id: t.skillContextDocs.skillId, path: t.skillContextDocs.path })
      .from(t.skillContextDocs)
      .innerJoin(t.skills, eq(t.skills.id, t.skillContextDocs.skillId))
      .where(eq(t.skills.workspaceId, workspaceId))
      .orderBy(asc(t.skillContextDocs.position));
    const group = (rows: { id: string; path: string }[]) => {
      const m = new Map<string, string[]>();
      for (const r of rows) m.set(r.id, [...(m.get(r.id) ?? []), r.path]);
      return m;
    };
    return { agents: group(agentRows), skills: group(skillRows) };
  }
}
