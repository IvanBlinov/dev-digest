import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { Finding, FindingPreview } from '@devdigest/shared';
import type { FindingRow, PullRow } from '../../../db/rows.js';

export type ReviewRow = typeof t.reviews.$inferSelect;

// ---- reviews + findings ---------------------------------------------------

export async function insertReview(
  db: Db,
  values: {
    workspaceId: string;
    prId: string;
    agentId: string | null;
    runId: string | null;
    kind: 'summary' | 'review';
    verdict: string | null;
    summary: string | null;
    score: number | null;
    model: string | null;
  },
): Promise<ReviewRow> {
  const [row] = await db.insert(t.reviews).values(values).returning();
  return row!;
}

export async function insertFindings(
  db: Db,
  reviewId: string,
  findings: Finding[],
): Promise<FindingRow[]> {
  if (findings.length === 0) return [];
  const rows = await db
    .insert(t.findings)
    .values(
      findings.map((f) => ({
        reviewId,
        file: f.file,
        startLine: f.start_line,
        endLine: f.end_line,
        severity: f.severity,
        category: f.category,
        title: f.title,
        rationale: f.rationale,
        suggestion: f.suggestion ?? null,
        confidence: f.confidence,
        kind: f.kind ?? 'finding',
        trifectaComponents: f.trifecta_components ?? null,
      })),
    )
    .returning();
  return rows;
}

/** Reviews for a PR (newest first), each with its findings. */
export async function reviewsForPull(
  db: Db,
  prId: string,
): Promise<{ review: ReviewRow; findings: FindingRow[]; costUsd: number | null }[]> {
  // Cost lives on the run row (agent_runs), not on the review — join by run_id.
  const reviews = await db
    .select({ review: t.reviews, costUsd: t.agentRuns.costUsd })
    .from(t.reviews)
    .leftJoin(t.agentRuns, eq(t.agentRuns.id, t.reviews.runId))
    .where(eq(t.reviews.prId, prId))
    .orderBy(desc(t.reviews.createdAt));
  if (reviews.length === 0) return [];
  const ids = reviews.map((r) => r.review.id);
  const findings = await db.select().from(t.findings).where(inArray(t.findings.reviewId, ids));
  return reviews.map(({ review, costUsd }) => ({
    review,
    findings: findings.filter((f) => f.reviewId === review.id),
    costUsd: costUsd ?? null,
  }));
}

export async function getReview(db: Db, reviewId: string): Promise<ReviewRow | undefined> {
  const [row] = await db.select().from(t.reviews).where(eq(t.reviews.id, reviewId));
  return row;
}

/** Delete a whole review (one agent's run) + its findings (cascade), scoped
 *  to the workspace. Returns false if not found in the workspace. */
export async function deleteReview(
  db: Db,
  workspaceId: string,
  reviewId: string,
): Promise<boolean> {
  const rows = await db
    .delete(t.reviews)
    .where(and(eq(t.reviews.workspaceId, workspaceId), eq(t.reviews.id, reviewId)))
    .returning({ id: t.reviews.id });
  return rows.length > 0;
}

// ---- finding actions ------------------------------------------------------

export async function getFinding(db: Db, findingId: string): Promise<FindingRow | undefined> {
  const [row] = await db.select().from(t.findings).where(eq(t.findings.id, findingId));
  return row;
}

/** Resolve workspace_id + pr_id for a finding (via review → pr). */
export async function findingContext(
  db: Db,
  findingId: string,
): Promise<{ finding: FindingRow; review: ReviewRow; pull: PullRow } | undefined> {
  const finding = await getFinding(db, findingId);
  if (!finding) return undefined;
  const review = await getReview(db, finding.reviewId);
  if (!review) return undefined;
  const [pull] = await db
    .select()
    .from(t.pullRequests)
    .where(eq(t.pullRequests.id, review.prId));
  if (!pull) return undefined;
  return { finding, review, pull };
}

export async function setFindingAccepted(
  db: Db,
  findingId: string,
  at: Date | null,
): Promise<FindingRow | undefined> {
  const [row] = await db
    .update(t.findings)
    .set({ acceptedAt: at, dismissedAt: null })
    .where(eq(t.findings.id, findingId))
    .returning();
  return row;
}

export async function setFindingDismissed(
  db: Db,
  findingId: string,
  at: Date | null,
): Promise<FindingRow | undefined> {
  const [row] = await db
    .update(t.findings)
    .set({ dismissedAt: at, acceptedAt: null })
    .where(eq(t.findings.id, findingId))
    .returning();
  return row;
}

// ---------------------------------------------------------------------------
// L01 findings-by-severity — read models for the rule in ../severity.ts.
// Only the columns the rule needs are selected (the PR list loads every PR).
// ---------------------------------------------------------------------------

export interface SeveritySummaryRows {
  reviews: { id: string; prId: string; agentId: string | null; createdAt: Date }[];
  findings: { reviewId: string; severity: string; dismissedAt: Date | null }[];
}

/** All `review`-kind reviews + their findings for a set of PRs. */
export async function severitySummaryForPulls(db: Db, prIds: string[]): Promise<SeveritySummaryRows> {
  if (prIds.length === 0) return { reviews: [], findings: [] };
  const reviews = await db
    .select({ id: t.reviews.id, prId: t.reviews.prId, agentId: t.reviews.agentId, createdAt: t.reviews.createdAt })
    .from(t.reviews)
    .where(and(inArray(t.reviews.prId, prIds), eq(t.reviews.kind, 'review')));
  const findings = await findingsLiteFor(db, reviews.map((r) => r.id));
  return { reviews, findings };
}

/** All `review`-kind reviews + findings of one workspace (agent aggregates). */
export async function severitySummaryForWorkspace(db: Db, workspaceId: string): Promise<SeveritySummaryRows> {
  const reviews = await db
    .select({ id: t.reviews.id, prId: t.reviews.prId, agentId: t.reviews.agentId, createdAt: t.reviews.createdAt })
    .from(t.reviews)
    .where(and(eq(t.reviews.workspaceId, workspaceId), eq(t.reviews.kind, 'review')));
  const findings = await findingsLiteFor(db, reviews.map((r) => r.id));
  return { reviews, findings };
}

async function findingsLiteFor(db: Db, reviewIds: string[]): Promise<SeveritySummaryRows['findings']> {
  if (reviewIds.length === 0) return [];
  return db
    .select({ reviewId: t.findings.reviewId, severity: t.findings.severity, dismissedAt: t.findings.dismissedAt })
    .from(t.findings)
    .where(inArray(t.findings.reviewId, reviewIds));
}

/**
 * Newest active findings of one agent, restricted to the given review ids (the
 * caller passes the agent's latest-per-PR reviews), joined with the PR number
 * for the hover preview.
 */
export async function recentActiveFindings(db: Db, reviewIds: string[], limit: number): Promise<FindingPreview[]> {
  if (reviewIds.length === 0) return [];
  const rows = await db
    .select({
      id: t.findings.id,
      severity: t.findings.severity,
      category: t.findings.category,
      title: t.findings.title,
      file: t.findings.file,
      startLine: t.findings.startLine,
      endLine: t.findings.endLine,
      confidence: t.findings.confidence,
      rationale: t.findings.rationale,
      reviewId: t.findings.reviewId,
      prId: t.reviews.prId,
      prNumber: t.pullRequests.number,
      createdAt: t.reviews.createdAt,
    })
    .from(t.findings)
    .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
    .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.reviews.prId))
    .where(and(inArray(t.findings.reviewId, reviewIds), isNull(t.findings.dismissedAt)))
    .orderBy(desc(t.reviews.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    severity: r.severity as FindingPreview['severity'],
    category: r.category as FindingPreview['category'],
    title: r.title,
    file: r.file,
    start_line: r.startLine,
    end_line: r.endLine,
    confidence: r.confidence,
    rationale: r.rationale,
    review_id: r.reviewId,
    pr_id: r.prId,
    pr_number: r.prNumber,
  }));
}
