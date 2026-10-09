import type { Finding, Review } from '@devdigest/shared';
import { scoreFromFindings } from './reduce.js';

/**
 * Scope helpers — pure and deterministic. Scope is a TAG the model sets on each
 * finding (`scope: 'in' | 'out'`); the filter itself is mechanical:
 *   - per agent: drop every out-of-scope finding, keep at most ONE eligible
 *     candidate (CRITICAL, or WARNING in category `security`);
 *   - per review execution: `pickScopeSignal` chooses ONE winner across agents.
 * Severity is never changed by scope.
 */

const SEVERITY_RANK: Record<Finding['severity'], number> = {
  CRITICAL: 2,
  WARNING: 1,
  SUGGESTION: 0,
};

export interface ScopeCandidate {
  finding: Finding;
  /** Job order of the agent that produced it (lower wins ties); optional. */
  order?: number;
}

const cmpStr = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Negative when `a` is the better signal. Total order, independent of input order. */
export function compareScopeSignal(a: ScopeCandidate, b: ScopeCandidate): number {
  const fa = a.finding;
  const fb = b.finding;
  return (
    SEVERITY_RANK[fb.severity] - SEVERITY_RANK[fa.severity] ||
    fb.confidence - fa.confidence ||
    (a.order ?? 0) - (b.order ?? 0) ||
    cmpStr(fa.file, fb.file) ||
    fa.start_line - fb.start_line ||
    cmpStr(fa.title, fb.title)
  );
}

export function isScopeSignalEligible(f: Finding): boolean {
  return (
    f.scope === 'out' &&
    (f.severity === 'CRITICAL' || (f.severity === 'WARNING' && f.category === 'security'))
  );
}

export interface ScopePartition {
  kept: Finding[];
  candidate: Finding | null;
  dropped: { finding: Finding; reason: string }[];
}

export function partitionByScope(findings: Finding[], opts: { enabled: boolean }): ScopePartition {
  if (!opts.enabled) return { kept: findings, candidate: null, dropped: [] };
  const kept = findings.filter((f) => f.scope !== 'out');
  const out = findings.filter((f) => f.scope === 'out');
  const eligible = out.filter(isScopeSignalEligible).map((finding) => ({ finding }));
  const best = [...eligible].sort(compareScopeSignal)[0]?.finding ?? null;
  const dropped = out
    .filter((f) => f !== best)
    .map((finding) => ({
      finding,
      reason: isScopeSignalEligible(finding)
        ? 'out of PR scope (not the top signal)'
        : 'out of PR scope',
    }));
  return { kept, candidate: best, dropped };
}

export function pickScopeSignal<T extends ScopeCandidate>(
  candidates: T[],
): { winner: T | null; losers: T[] } {
  const sorted = [...candidates].sort(compareScopeSignal);
  return { winner: sorted[0] ?? null, losers: sorted.slice(1) };
}

/** Append the chosen signal and recompute the score. Never mutates `review`. */
export function withScopeSignal(review: Review, signal: Finding | null): Review {
  if (!signal) return review;
  const findings = [...review.findings, signal];
  return { ...review, findings, score: scoreFromFindings(findings) };
}
