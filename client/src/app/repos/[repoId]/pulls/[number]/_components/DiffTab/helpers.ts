/** Pure helpers for the DiffTab smart view. */
import type { FindingRecord, PrFile, SmartDiffResponse, SmartDiffRole } from "@devdigest/shared";
import { SEVERITY_LINE_LABEL_KEY } from "./constants";

export interface JoinedGroup {
  role: SmartDiffRole;
  files: PrFile[];
}

/**
 * Resolve the server's grouping (paths) to the PR's `PrFile`s (patches).
 * Server order is kept; a PR file the server did not mention goes to core
 * (never silently dropped); groups left empty are dropped.
 */
export function joinGroups(smartDiff: SmartDiffResponse, prFiles: readonly PrFile[]): JoinedGroup[] {
  const byPath = new Map(prFiles.map((f) => [f.path, f]));
  const seen = new Set<string>();
  const groups: JoinedGroup[] = smartDiff.groups.map((g) => ({
    role: g.role,
    files: g.files.flatMap((sf) => {
      const f = byPath.get(sf.path);
      if (!f || seen.has(f.path)) return [];
      seen.add(f.path);
      return [f];
    }),
  }));
  const orphans = prFiles.filter((f) => !seen.has(f.path));
  const withOrphans =
    orphans.length === 0
      ? groups
      : groups.some((g) => g.role === "core")
        ? groups.map((g) => (g.role === "core" ? { ...g, files: [...g.files, ...orphans] } : g))
        : [{ role: "core" as const, files: orphans }, ...groups];
  return withOrphans.filter((g) => g.files.length > 0);
}

/** How many of these files have at least one finding (files, not findings). */
export function filesWithFindings(
  files: readonly PrFile[],
  findings: readonly Pick<FindingRecord, "file">[],
): number {
  const flagged = new Set(findings.map((f) => f.file));
  return files.filter((f) => flagged.has(f.path)).length;
}

/** `smartDiff.lineLabel.<key>` for a severity, or null (INFO). */
export function lineLabelKey(severity: string): "blocker" | "warning" | "suggestion" | null {
  return SEVERITY_LINE_LABEL_KEY[severity] ?? null;
}

/** The diff-viewer line key a finding is anchored on (new side). */
export function findingKey(f: Pick<FindingRecord, "start_line">): string {
  return `RIGHT:${f.start_line}`;
}

export function totals(files: readonly PrFile[]): { files: number; additions: number; deletions: number } {
  return files.reduce(
    (t, f) => ({ files: t.files + 1, additions: t.additions + (f.additions ?? 0), deletions: t.deletions + (f.deletions ?? 0) }),
    { files: 0, additions: 0, deletions: 0 },
  );
}
