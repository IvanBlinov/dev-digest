import type { SeverityCounts } from '@devdigest/shared';
export type { SeverityCounts };

/**
 * Findings-by-severity rule (L01). ONE place decides what "the PR's findings"
 * means, so the PR list, the PR header and the agent cards never disagree:
 *
 *   for every agent that reviewed the PR, take its NEWEST review;
 *   count that review's findings that are not dismissed.
 *
 * Re-runs therefore never double-count, and triage (dismiss) is reflected
 * immediately. Reviews whose agent was deleted (`agentId = null`) form their
 * own bucket so their findings still count.
 */

export interface ReviewLite {
  id: string;
  agentId: string | null;
  createdAt: Date;
}

export interface FindingLite {
  reviewId: string;
  severity: string;
  dismissedAt: Date | null;
}

const NULL_AGENT = '__no_agent__';

/** Newest row per bucket. Order-independent. */
export function pickLatestBy<T extends { createdAt: Date }>(rows: readonly T[], keyOf: (row: T) => string): T[] {
  const best = new Map<string, T>();
  for (const r of rows) {
    const key = keyOf(r);
    const cur = best.get(key);
    if (!cur || r.createdAt.getTime() > cur.createdAt.getTime()) best.set(key, r);
  }
  return [...best.values()];
}

/** Newest review per agent bucket (deleted agent = its own bucket). */
export function pickLatestPerAgent<T extends ReviewLite>(reviews: readonly T[]): T[] {
  return pickLatestBy(reviews, (r) => r.agentId ?? NULL_AGENT);
}

/**
 * The agent-side rule: for ONE agent, its newest review per PR, active findings
 * counted. `null` when the agent has never produced a review.
 */
export function countActiveFindingsForAgent(
  reviews: readonly (ReviewLite & { prId: string })[],
  findings: readonly FindingLite[],
): SeverityCounts | null {
  if (reviews.length === 0) return null;
  const latestIds = new Set(pickLatestBy(reviews, (r) => r.prId).map((r) => r.id));
  return rollupSeverities(activeFindings(findings).filter((f) => latestIds.has(f.reviewId)));
}

/** Findings that have not been dismissed. */
export function activeFindings<T extends { dismissedAt: Date | null }>(rows: readonly T[]): T[] {
  return rows.filter((f) => f.dismissedAt == null);
}

/** Tally finding severities (CRITICAL / WARNING / SUGGESTION). */
export function rollupSeverities(rows: readonly { severity: string }[]): SeverityCounts {
  return rows.reduce<SeverityCounts>(
    (c, r) =>
      r.severity === 'CRITICAL'
        ? { ...c, critical: c.critical + 1 }
        : r.severity === 'WARNING'
          ? { ...c, warning: c.warning + 1 }
          : r.severity === 'SUGGESTION'
            ? { ...c, suggestion: c.suggestion + 1 }
            : c,
    { critical: 0, warning: 0, suggestion: 0 },
  );
}

/**
 * Apply the rule to one PR's reviews + findings. `null` when the PR has no
 * reviews at all ("never reviewed"), zeros when reviewed and clean.
 */
export function countActiveFindings(
  reviews: readonly ReviewLite[],
  findings: readonly FindingLite[],
): SeverityCounts | null {
  if (reviews.length === 0) return null;
  const latestIds = new Set(pickLatestPerAgent(reviews).map((r) => r.id));
  const rows = activeFindings(findings).filter((f) => latestIds.has(f.reviewId));
  return rollupSeverities(rows);
}

/** Group by a key without mutating the input rows. */
export function groupBy<T>(rows: readonly T[], keyOf: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    out.set(key, [...(out.get(key) ?? []), row]);
  }
  return out;
}
