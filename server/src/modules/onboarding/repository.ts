import { and, eq, lt, sql } from 'drizzle-orm';
import type { OnboardingReason, OnboardingTour } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * L05b — onboarding data-access. Owns the `onboarding` table: one row per repo holding the
 * stored tour (`json`), the lifecycle `status` and the last failure. No business decisions here.
 */
export type OnboardingRow = typeof t.onboarding.$inferSelect;

const isTour = (json: unknown): json is OnboardingTour =>
  typeof json === 'object' && json !== null && 'status' in json && 'sections' in json;

const lastError = (reason: OnboardingReason) => ({ reason, at: new Date().toISOString() });

export class OnboardingRepository {
  constructor(private db: Db) {}

  async get(repoId: string): Promise<OnboardingRow | undefined> {
    const [row] = await this.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId)).limit(1);
    return row;
  }

  /**
   * Mark the repo's onboarding as `generating` unless a generation is already running. A per-repo
   * transaction-scoped advisory lock serialises concurrent starts. Any stored tour stays readable.
   * Returns undefined when a generation is already running.
   */
  async startIfIdle(repoId: string): Promise<OnboardingRow | undefined> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`onboarding:${repoId}`}))`);
      const [existing] = await tx.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId)).limit(1);
      if (existing?.status === 'generating') return undefined;
      const now = new Date();
      if (!existing) {
        const [row] = await tx
          .insert(t.onboarding)
          .values({ repoId, status: 'generating', startedAt: now })
          .returning();
        return row!;
      }
      const [row] = await tx
        .update(t.onboarding)
        .set({ status: 'generating', startedAt: now, lastError: null })
        .where(eq(t.onboarding.repoId, repoId))
        .returning();
      return row!;
    });
  }

  /** Store the finished tour as the repo's only row and set the status from the tour. */
  async finishSuccess(repoId: string, tour: OnboardingTour): Promise<void> {
    const values = {
      json: tour,
      status: tour.status,
      lastError: null,
      startedAt: null,
      generatedAt: new Date(),
      promptVersion: tour.prompt_version,
      indexSha: tour.index_sha,
    };
    await this.db
      .insert(t.onboarding)
      .values({ repoId, ...values })
      .onConflictDoUpdate({ target: t.onboarding.repoId, set: values });
  }

  /**
   * Record a failed generation. A stored ready/partial tour is kept unchanged (status `failed`);
   * otherwise the skeleton is stored with status `skeleton` (or just `failed` when none is given).
   */
  async finishFailure(repoId: string, reason: OnboardingReason, skeleton: OnboardingTour | null): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`onboarding:${repoId}`}))`);
      const [existing] = await tx.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId)).limit(1);
      const keepsTour = isTour(existing?.json) && existing.json.status !== 'skeleton';
      const error = lastError(reason);
      if (keepsTour || !skeleton) {
        await tx
          .insert(t.onboarding)
          .values({ repoId, status: 'failed', lastError: error })
          .onConflictDoUpdate({ target: t.onboarding.repoId, set: { status: 'failed', lastError: error, startedAt: null } });
        return;
      }
      const values = {
        json: skeleton,
        status: 'skeleton',
        lastError: error,
        startedAt: null,
        generatedAt: new Date(),
        promptVersion: skeleton.prompt_version,
        indexSha: skeleton.index_sha,
      };
      await tx
        .insert(t.onboarding)
        .values({ repoId, ...values })
        .onConflictDoUpdate({ target: t.onboarding.repoId, set: values });
    });
  }

  /** Fail generations that started more than `olderThanMs` ago (process died). Returns the count. */
  async failStale(olderThanMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanMs);
    const rows = await this.db
      .update(t.onboarding)
      .set({ status: 'failed', lastError: lastError('interrupted') })
      .where(and(eq(t.onboarding.status, 'generating'), lt(t.onboarding.startedAt, cutoff)))
      .returning({ repoId: t.onboarding.repoId });
    return rows.length;
  }
}
