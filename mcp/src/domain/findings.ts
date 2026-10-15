import type { ReviewRecord, RunSummary, Severity } from '@devdigest/shared';

export type RunOutcome =
  | { status: 'running'; ageSec: number }
  | { status: 'finishing' }
  | { status: 'failed'; error: string | null }
  | { status: 'cancelled'; error: string | null }
  | { status: 'done'; review: ReviewRecord };

/** A run that has not finished yet, as reported alongside PR-level findings. */
export interface RunRef {
  runId: string;
  agentName: string;
  ageSec: number;
}

export interface ReviewSummary {
  agentName: string;
  verdict: string | null;
  score: number | null;
  summary: string | null;
}

export interface FindingItem {
  id: string;
  severity: Severity;
  category: string;
  title: string;
  file: string;
  startLine: number;
  endLine: number;
  rationale: string;
  suggestion: string | null;
  confidence: number;
  agentName: string;
}

export interface FindingsPage {
  counts: { critical: number; warning: number; suggestion: number };
  total: number;
  dismissedCount: number;
  items: FindingItem[];
  offset: number;
  /** Offset for the next page, or null on the last page. */
  nextOffset: number | null;
}

export interface PageOptions {
  severityMin: Severity;
  limit: number;
  offset: number;
}

const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

export function ageSeconds(ranAt: string | null, now: number): number {
  if (!ranAt) return 0;
  const t = Date.parse(ranAt);
  return Number.isNaN(t) ? 0 : Math.max(0, Math.floor((now - t) / 1000));
}

export function classifyRun(run: RunSummary, reviews: ReviewRecord[], now: number): RunOutcome {
  switch (run.status) {
    case 'done': {
      const review = reviews.find((r) => r.run_id === run.run_id && r.kind === 'review');
      return review ? { status: 'done', review } : { status: 'finishing' };
    }
    case 'failed':
      return { status: 'failed', error: run.error };
    case 'cancelled':
      return { status: 'cancelled', error: run.error };
    default:
      return { status: 'running', ageSec: ageSeconds(run.ran_at, now) };
  }
}

export function latestReviewPerAgent(reviews: ReviewRecord[]): ReviewRecord[] {
  const latest = new Map<string, ReviewRecord>();
  for (const r of reviews) {
    if (r.kind !== 'review') continue;
    const key = r.agent_id ?? '';
    const cur = latest.get(key);
    if (!cur || r.created_at > cur.created_at) latest.set(key, r);
  }
  return [...latest.values()];
}

export function toReviewSummary(r: ReviewRecord): ReviewSummary {
  return {
    agentName: r.agent_name ?? 'unknown agent',
    verdict: r.verdict,
    score: r.score,
    summary: r.summary,
  };
}

export function findingsPage(reviews: ReviewRecord[], opts: PageOptions): FindingsPage {
  const maxRank = SEVERITY_RANK[opts.severityMin];
  let dismissedCount = 0;
  const all: FindingItem[] = [];
  for (const r of reviews) {
    for (const f of r.findings) {
      if (f.dismissed_at) {
        dismissedCount += 1;
        continue;
      }
      if (SEVERITY_RANK[f.severity] > maxRank) continue;
      all.push({
        id: f.id,
        severity: f.severity,
        category: f.category,
        title: f.title,
        file: f.file,
        startLine: f.start_line,
        endLine: f.end_line,
        rationale: f.rationale,
        suggestion: f.suggestion ?? null,
        confidence: f.confidence,
        agentName: r.agent_name ?? 'unknown agent',
      });
    }
  }
  all.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      b.confidence - a.confidence ||
      a.file.localeCompare(b.file) ||
      a.startLine - b.startLine,
  );
  const counts = {
    critical: all.filter((i) => i.severity === 'CRITICAL').length,
    warning: all.filter((i) => i.severity === 'WARNING').length,
    suggestion: all.filter((i) => i.severity === 'SUGGESTION').length,
  };
  const items = all.slice(opts.offset, opts.offset + opts.limit);
  const end = opts.offset + items.length;
  return {
    counts,
    total: all.length,
    dismissedCount,
    items,
    offset: opts.offset,
    nextOffset: end < all.length ? end : null,
  };
}
