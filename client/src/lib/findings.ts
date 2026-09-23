/**
 * Findings-by-severity (L01) — client-side twin of `server/src/modules/reviews/severity.ts`.
 * The PR page already holds every review, so it derives the counters locally
 * with the SAME rule as the server: newest review per agent, dismissed excluded.
 */
import type { FindingRecord, ReviewRecord, SeverityCounts } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";

export type SeverityLevel = "CRITICAL" | "WARNING" | "SUGGESTION";

export interface SeverityMeta {
  level: SeverityLevel;
  /** key into `SeverityCounts` */
  key: keyof SeverityCounts;
  color: string;
  bg: string;
  icon: IconName;
  label: string;
}

/** Display order = severity order. */
export const SEVERITY_LEVELS: readonly SeverityMeta[] = [
  { level: "CRITICAL", key: "critical", color: "var(--crit)", bg: "var(--crit-bg)", icon: "AlertOctagon", label: "Critical" },
  { level: "WARNING", key: "warning", color: "var(--warn)", bg: "var(--warn-bg)", icon: "AlertTriangle", label: "Warning" },
  { level: "SUGGESTION", key: "suggestion", color: "var(--sugg)", bg: "var(--sugg-bg)", icon: "Lightbulb", label: "Suggestion" },
];

export const SEVERITY_RANK: Record<string, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

export function isSeverityLevel(v: unknown): v is SeverityLevel {
  return v === "CRITICAL" || v === "WARNING" || v === "SUGGESTION";
}

const NULL_AGENT = "__no_agent__";

/** Newest review per agent (a deleted agent's reviews form their own bucket). */
export function latestPerAgent(reviews: readonly ReviewRecord[]): ReviewRecord[] {
  const best = new Map<string, ReviewRecord>();
  for (const r of reviews) {
    if (r.kind !== "review") continue;
    const key = r.agent_id ?? NULL_AGENT;
    const cur = best.get(key);
    if (!cur || Date.parse(r.created_at) > Date.parse(cur.created_at)) best.set(key, r);
  }
  return [...best.values()];
}

/** Findings that have not been dismissed. */
export function activeFindings<T extends { dismissed_at: string | null }>(findings: readonly T[]): T[] {
  return findings.filter((f) => f.dismissed_at == null);
}

/** Tally by severity (INFO and unknown severities are ignored). */
export function countBySeverity(findings: readonly { severity: string }[]): SeverityCounts {
  return findings.reduce<SeverityCounts>(
    (c, f) =>
      f.severity === "CRITICAL"
        ? { ...c, critical: c.critical + 1 }
        : f.severity === "WARNING"
          ? { ...c, warning: c.warning + 1 }
          : f.severity === "SUGGESTION"
            ? { ...c, suggestion: c.suggestion + 1 }
            : c,
    { critical: 0, warning: 0, suggestion: 0 },
  );
}

/** The PR summary: active findings of the newest review per agent. */
export function prActiveFindings(reviews: readonly ReviewRecord[]): FindingRecord[] {
  return activeFindings(latestPerAgent(reviews).flatMap((r) => r.findings));
}

/** `null` = never reviewed; zeros = reviewed and clean. */
export function prSeverityCounts(reviews: readonly ReviewRecord[]): SeverityCounts | null {
  if (!reviews.some((r) => r.kind === "review")) return null;
  return countBySeverity(prActiveFindings(reviews));
}

export function totalCount(c: SeverityCounts): number {
  return c.critical + c.warning + c.suggestion;
}

/** Sort CRITICAL → WARNING → SUGGESTION, stable otherwise. Returns a new array. */
export function sortBySeverity<T extends { severity: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9));
}
