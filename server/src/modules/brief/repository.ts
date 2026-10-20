import { eq } from 'drizzle-orm';
import { PrBrief } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Data access for `pr_brief` (one row per PR, the whole `PrBrief` as jsonb).
 * No business decisions here — staleness and validation live in `helpers.ts`.
 */
export class BriefRepository {
  constructor(private db: Db) {}

  /** The stored brief, or null when none is stored or the stored json no longer parses. */
  async get(prId: string): Promise<PrBrief | null> {
    const [row] = await this.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));
    if (!row) return null;
    const parsed = PrBrief.safeParse(row.json);
    return parsed.success ? parsed.data : null;
  }

  /** Insert or overwrite the PR's brief. */
  async replace(prId: string, brief: PrBrief): Promise<void> {
    await this.db
      .insert(t.prBrief)
      .values({ prId, json: brief })
      .onConflictDoUpdate({ target: t.prBrief.prId, set: { json: brief } });
  }
}
