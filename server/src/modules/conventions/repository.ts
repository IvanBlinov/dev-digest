import { and, eq, inArray, lt, ne, desc, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionCategory, ConventionStatus } from '@devdigest/shared';

/**
 * L03 — conventions data-access. Owns `convention_scans` and `conventions`.
 * Every read/write that addresses a row by id is workspace-scoped.
 */

export type ConventionRow = typeof t.conventions.$inferSelect;
export type ConventionScanRow = typeof t.conventionScans.$inferSelect;

export interface NewConvention {
  category: ConventionCategory;
  rule: string;
  evidencePath: string;
  startLine: number;
  endLine: number;
  snippet: string;
  confidence: number;
}

export interface ConventionPatch {
  status?: ConventionStatus;
  accepted?: boolean;
  rule?: string;
  category?: ConventionCategory;
  evidencePath?: string;
  evidenceStartLine?: number | null;
  evidenceEndLine?: number | null;
  evidenceSnippet?: string;
  edited?: boolean;
}

export interface NewScan {
  workspaceId: string;
  repoId: string;
  provider: string;
  model: string;
  sampleFiles: string[];
}

export class ConventionsRepository {
  constructor(private db: Db) {}

  // ---- scans --------------------------------------------------------------

  async latestScan(workspaceId: string, repoId: string): Promise<ConventionScanRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventionScans)
      .where(and(eq(t.conventionScans.workspaceId, workspaceId), eq(t.conventionScans.repoId, repoId)))
      .orderBy(desc(t.conventionScans.startedAt))
      .limit(1);
    return row;
  }

  async runningScan(repoId: string): Promise<ConventionScanRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventionScans)
      .where(and(eq(t.conventionScans.repoId, repoId), eq(t.conventionScans.status, 'running')))
      .limit(1);
    return row;
  }

  /** Fail `running` scans of a repo started before `cutoff` (orphaned by a dead process). */
  async failStaleScans(repoId: string, cutoff: Date, error: string): Promise<number> {
    const rows = await this.db
      .update(t.conventionScans)
      .set({ status: 'failed', error, finishedAt: new Date() })
      .where(
        and(
          eq(t.conventionScans.repoId, repoId),
          eq(t.conventionScans.status, 'running'),
          lt(t.conventionScans.startedAt, cutoff),
        ),
      )
      .returning({ id: t.conventionScans.id });
    return rows.length;
  }

  /**
   * Insert a `running` scan unless the repo already has one. A per-repo
   * transaction-scoped advisory lock serialises concurrent extract requests,
   * so two clicks can never both start a scan. Returns undefined on conflict.
   */
  async createScanIfIdle(values: NewScan): Promise<ConventionScanRow | undefined> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`convention_scan:${values.repoId}`}))`);
      const [running] = await tx
        .select({ id: t.conventionScans.id })
        .from(t.conventionScans)
        .where(and(eq(t.conventionScans.repoId, values.repoId), eq(t.conventionScans.status, 'running')))
        .limit(1);
      if (running) return undefined;
      const [row] = await tx
        .insert(t.conventionScans)
        .values({ ...values, status: 'running' })
        .returning();
      return row!;
    });
  }

  /** Mark a still-running scan failed. No-op when it already finished. */
  async failScan(scanId: string, error: string): Promise<void> {
    await this.db
      .update(t.conventionScans)
      .set({ status: 'failed', error, finishedAt: new Date() })
      .where(and(eq(t.conventionScans.id, scanId), eq(t.conventionScans.status, 'running')));
  }

  /**
   * Apply a re-scan result atomically: claim the scan (only if still running —
   * a scan already failed as stale must not write candidates), delete the
   * replaced pending candidates, insert the new ones, close the scan.
   * Returns false when the scan was no longer running.
   */
  async completeScan(
    scan: Pick<ConventionScanRow, 'id' | 'workspaceId' | 'repoId'>,
    deleteIds: string[],
    inserts: NewConvention[],
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(t.conventionScans)
        .set({ status: 'done', candidatesFound: inserts.length, finishedAt: new Date(), error: null })
        .where(and(eq(t.conventionScans.id, scan.id), eq(t.conventionScans.status, 'running')))
        .returning({ id: t.conventionScans.id });
      if (!claimed) return false;
      if (deleteIds.length > 0) {
        await tx
          .delete(t.conventions)
          .where(
            and(
              eq(t.conventions.repoId, scan.repoId),
              inArray(t.conventions.id, deleteIds),
              eq(t.conventions.status, 'pending'),
              eq(t.conventions.edited, false),
            ),
          );
      }
      if (inserts.length > 0) {
        await tx.insert(t.conventions).values(
          inserts.map((c) => ({
            workspaceId: scan.workspaceId,
            repoId: scan.repoId,
            scanId: scan.id,
            category: c.category,
            rule: c.rule,
            evidencePath: c.evidencePath,
            evidenceStartLine: c.startLine,
            evidenceEndLine: c.endLine,
            evidenceSnippet: c.snippet,
            confidence: c.confidence,
            status: 'pending' as const,
            accepted: false,
          })),
        );
      }
      return true;
    });
  }

  // ---- candidates ---------------------------------------------------------

  /** Every candidate of a repo, rejected included (the re-scan merge needs them). */
  async listAll(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)));
  }

  /** Candidates shown to the user — rejected ones never come back (req 48). */
  async listVisible(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          ne(t.conventions.status, 'rejected'),
        ),
      );
  }

  async getById(workspaceId: string, id: string): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row;
  }

  async getByIds(workspaceId: string, repoId: string, ids: string[]): Promise<ConventionRow[]> {
    if (ids.length === 0) return [];
    return this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          inArray(t.conventions.id, ids),
        ),
      );
  }

  async update(workspaceId: string, id: string, patch: ConventionPatch): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set(patch)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }
}
