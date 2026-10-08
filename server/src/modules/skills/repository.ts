import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillSource, SkillType } from '@devdigest/shared';

/**
 * L02 — skills data-access. Owns `skills` and `skill_versions`; reads
 * `agent_skills` for agent counts and the effective (prompt-bound) skill list.
 * Every method that addresses a skill by id is workspace-scoped.
 */

export type SkillRow = typeof t.skills.$inferSelect;
export type SkillVersionRow = typeof t.skillVersions.$inferSelect;

/** A skill as it reaches a review prompt (see `effectiveSkillsForAgent`). */
export interface EffectiveSkill {
  id: string;
  name: string;
  version: number;
  type: string;
  body: string;
}

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  enabled?: boolean;
  /** Files the skill was derived from (L03: extracted conventions). */
  evidenceFiles?: string[] | null;
  /** Note stored on the v1 snapshot. */
  message: string;
}

export interface SkillContentPatch {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

export class SkillsRepository {
  constructor(private db: Db) {}

  /**
   * The skills that reach an agent's review prompt, in link order: only links
   * with `agent_skills.enabled` AND `skills.enabled`. Consumed by the run executor.
   */
  async effectiveSkillsForAgent(agentId: string): Promise<EffectiveSkill[]> {
    return this.db
      .select({
        id: t.skills.id,
        name: t.skills.name,
        version: t.skills.version,
        type: t.skills.type,
        body: t.skills.body,
      })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(
        and(
          eq(t.agentSkills.agentId, agentId),
          eq(t.agentSkills.enabled, true),
          eq(t.skills.enabled, true),
        ),
      )
      .orderBy(asc(t.agentSkills.order), asc(t.skills.name));
  }

  async list(workspaceId: string): Promise<SkillRow[]> {
    return this.db
      .select()
      .from(t.skills)
      .where(eq(t.skills.workspaceId, workspaceId))
      .orderBy(asc(t.skills.name));
  }

  async getById(workspaceId: string, id: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  async getByName(workspaceId: string, name: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, name)));
    return row;
  }

  /** Ids (of `ids`) that belong to the workspace — used to validate link payloads. */
  async existingIds(workspaceId: string, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), inArray(t.skills.id, ids)));
    return new Set(rows.map((r) => r.id));
  }

  /** Name + body of the given skills that belong to the workspace (L03b enable guard). */
  async bodiesByIds(workspaceId: string, ids: string[]): Promise<Array<{ id: string; name: string; body: string }>> {
    if (ids.length === 0) return [];
    return this.db
      .select({ id: t.skills.id, name: t.skills.name, body: t.skills.body })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), inArray(t.skills.id, ids)));
  }

  /** Number of agent links (enabled or not) per skill id. */
  async agentCounts(skillIds: string[]): Promise<Map<string, number>> {
    if (skillIds.length === 0) return new Map();
    const rows = await this.db
      .select({ skillId: t.agentSkills.skillId, n: count() })
      .from(t.agentSkills)
      .where(inArray(t.agentSkills.skillId, skillIds))
      .groupBy(t.agentSkills.skillId);
    return new Map(rows.map((r) => [r.skillId, Number(r.n)]));
  }

  /** Insert a skill at v1 and its v1 snapshot, atomically. */
  async insert(values: InsertSkill): Promise<SkillRow> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(t.skills)
        .values({
          workspaceId: values.workspaceId,
          name: values.name,
          description: values.description,
          type: values.type,
          source: values.source,
          body: values.body,
          enabled: values.enabled ?? true,
          evidenceFiles: values.evidenceFiles ?? null,
          version: 1,
        })
        .returning();
      await tx
        .insert(t.skillVersions)
        .values({ skillId: row!.id, version: 1, body: row!.body, message: values.message });
      return row!;
    });
  }

  /**
   * Apply a patch. When `bump` is given the version is incremented IN SQL
   * (`version = version + 1 … RETURNING`) and the new body snapshotted at the
   * returned version, in one transaction: the row lock serialises concurrent
   * writers, so two bumps can never compute the same version (the service only
   * decides WHETHER content changed). Without `bump` only the fields are written.
   */
  async update(
    workspaceId: string,
    id: string,
    patch: SkillContentPatch,
    bump: { message: string | null } | null,
  ): Promise<SkillRow | undefined> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(t.skills)
        .set({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.type !== undefined ? { type: patch.type } : {}),
          ...(patch.body !== undefined ? { body: patch.body } : {}),
          ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
          ...(bump ? { version: sql`${t.skills.version} + 1` } : {}),
        })
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .returning();
      if (row && bump) {
        await tx
          .insert(t.skillVersions)
          .values({ skillId: row.id, version: row.version, body: row.body, message: bump.message });
      }
      return row;
    });
  }

  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  async listVersions(skillId: string): Promise<SkillVersionRow[]> {
    return this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
  }

  async getVersion(skillId: string, version: number): Promise<SkillVersionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skillVersions)
      .where(and(eq(t.skillVersions.skillId, skillId), eq(t.skillVersions.version, version)));
    return row;
  }
}
