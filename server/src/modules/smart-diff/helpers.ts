import type { SmartDiff, SmartDiffRole } from '@devdigest/shared';
import { CLASSIFY_RULES, ROLE_ORDER, type ClassifyRule } from './constants.js';

/** The slice of a `pr_files` row the grouping needs. */
export interface SmartDiffInputFile {
  path: string;
  additions: number;
  deletions: number;
}

/** The slice of a finding the grouping needs. */
export interface SmartDiffInputFinding {
  file: string;
  start_line: number;
}

function matches(rule: ClassifyRule, base: string, dirs: readonly string[]): boolean {
  return (
    !!rule.basenames?.includes(base) ||
    !!rule.suffixes?.some((s) => base.endsWith(s)) ||
    !!rule.prefixes?.some((p) => base.startsWith(p)) ||
    !!rule.prefixSuffix?.some(([p, s]) => base.startsWith(p) && base.endsWith(s)) ||
    !!rule.includes?.some((i) => base.includes(i)) ||
    !!rule.segments?.some((seg) => dirs.includes(seg))
  );
}

/** Role of one changed file. Pure path heuristics; first matching rule wins, default `core`. */
export function classifyFile(path: string): SmartDiffRole {
  const segments = path.replace(/\\/g, '/').toLowerCase().split('/').filter(Boolean);
  const base = segments[segments.length - 1] ?? '';
  const dirs = segments.slice(0, -1);
  return CLASSIFY_RULES.find((r) => matches(r, base, dirs))?.role ?? 'core';
}

/** Group PR files by role (ROLE_ORDER, empty roles omitted) and attach finding lines per file. */
export function buildSmartDiff(
  files: readonly SmartDiffInputFile[],
  findings: readonly SmartDiffInputFinding[],
): SmartDiff {
  const linesByFile = new Map<string, Set<number>>();
  for (const f of findings) {
    const set = linesByFile.get(f.file) ?? new Set<number>();
    set.add(f.start_line);
    linesByFile.set(f.file, set);
  }

  const byRole = new Map<SmartDiffRole, SmartDiff['groups'][number]['files']>();
  for (const f of files) {
    const role = classifyFile(f.path);
    const entry = {
      path: f.path,
      additions: f.additions,
      deletions: f.deletions,
      finding_lines: [...(linesByFile.get(f.path) ?? [])].sort((a, b) => a - b),
    };
    byRole.set(role, [...(byRole.get(role) ?? []), entry]);
  }

  return {
    groups: ROLE_ORDER.filter((role) => byRole.has(role)).map((role) => ({ role, files: byRole.get(role)! })),
    split_suggestion: {
      too_big: false,
      total_lines: files.reduce((n, f) => n + f.additions + f.deletions, 0),
      proposed_splits: [],
    },
  };
}
