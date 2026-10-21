import type { RiskRef, RiskSeverity } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";

export const SEVERITY_COLOR: Record<RiskSeverity, string> = {
  high: "var(--crit)",
  medium: "var(--warn)",
  low: "var(--text-muted)",
};

const KIND_ICON: Record<string, IconName> = {
  security: "Shield",
  dependency: "Boxes",
  performance: "Zap",
};

export function kindIcon(kind: string): IconName {
  return KIND_ICON[kind] ?? "AlertTriangle";
}

/** `file:12-18`, `file:12` or `file`. */
export function refLabel(ref: RiskRef): string {
  if (ref.start_line == null) return ref.file;
  if (ref.end_line != null && ref.end_line !== ref.start_line) return `${ref.file}:${ref.start_line}-${ref.end_line}`;
  return `${ref.file}:${ref.start_line}`;
}
