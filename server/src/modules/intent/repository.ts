import { asc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export type IntentRow = typeof t.prIntent.$inferSelect;
export type IntentUpsert = Omit<IntentRow, 'prId' | 'detectedAt'>;

/**
 * Data access for `pr_intent` (one row per PR) and the PR's commit messages.
 * No business decisions here — staleness and clamping live in `helpers.ts`.
 */
export class IntentRepository {
  constructor(private db: Db) {}

  async get(prId: string): Promise<IntentRow | undefined> {
    const [row] = await this.db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
    return row;
  }

  /** Insert or overwrite the PR's intent; `detected_at` is bumped on every write. */
  async upsert(prId: string, values: IntentUpsert): Promise<void> {
    const detectedAt = new Date();
    await this.db
      .insert(t.prIntent)
      .values({ prId, ...values, detectedAt })
      .onConflictDoUpdate({ target: t.prIntent.prId, set: { ...values, detectedAt } });
  }

  /** First line of each commit message, ordered by sha for a stable prompt/hash. */
  async commitMessages(prId: string): Promise<string[]> {
    const rows = await this.db
      .select({ message: t.prCommits.message })
      .from(t.prCommits)
      .where(eq(t.prCommits.prId, prId))
      .orderBy(asc(t.prCommits.sha));
    return rows.map((r) => (r.message ?? '').split('\n')[0] ?? '');
  }
}
