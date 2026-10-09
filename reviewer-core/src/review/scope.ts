import type { Finding } from '@devdigest/shared';

/**
 * Scope helpers — pure and deterministic. Scope is a TAG the model sets on each
 * finding (`scope: 'in' | 'out'`); the filter itself is mechanical:
 *   - serious out-of-scope findings (CRITICAL, or WARNING in category `security`)
 *     are ALWAYS kept, still tagged `out` so the UI can badge them;
 *   - every other out-of-scope finding is dropped.
 * The PR author controls the intent text, so scope must never hide a serious
 * defect. Severity is never changed by scope.
 */

export function isProtectedFromScopeFilter(f: Finding): boolean {
  return (
    f.scope === 'out' &&
    (f.severity === 'CRITICAL' || (f.severity === 'WARNING' && f.category === 'security'))
  );
}

export interface ScopePartition {
  kept: Finding[];
  dropped: { finding: Finding; reason: string }[];
}

export function partitionByScope(findings: Finding[], opts: { enabled: boolean }): ScopePartition {
  if (!opts.enabled) return { kept: findings, dropped: [] };
  const kept: Finding[] = [];
  const dropped: ScopePartition['dropped'] = [];
  for (const finding of findings) {
    if (finding.scope !== 'out' || isProtectedFromScopeFilter(finding)) kept.push(finding);
    else dropped.push({ finding, reason: 'out of PR scope' });
  }
  return { kept, dropped };
}
