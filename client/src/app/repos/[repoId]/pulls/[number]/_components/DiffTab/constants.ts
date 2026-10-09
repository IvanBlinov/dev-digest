/** Constants for the DiffTab (smart view). Type-only import: a value import from
   @devdigest/shared breaks `next build` (client/INSIGHTS.md). */
import type { SmartDiffRole } from "@devdigest/shared";

/** `smartDiff.<key>` i18n key of each role's label. A missing role is a compile error. */
export const ROLE_LABEL_KEY: Record<SmartDiffRole, string> = {
  core: "coreLabel",
  tests: "testsLabel",
  wiring: "wiringLabel",
  docs: "docsLabel",
  boilerplate: "boilerplateLabel",
};

/** `smartDiff.<key>` i18n key of each role's one-line description. */
export const ROLE_HINT_KEY: Record<SmartDiffRole, string> = {
  core: "coreHint",
  tests: "testsHint",
  wiring: "wiringHint",
  docs: "docsHint",
  boilerplate: "boilerplateHint",
};

/** Groups that start collapsed — low-signal for a reviewer. */
export const COLLAPSED_ROLES: ReadonlySet<SmartDiffRole> = new Set<SmartDiffRole>(["docs", "boilerplate"]);

/** Severity → `smartDiff.lineLabel.<key>` (INFO gets no line marker). */
export const SEVERITY_LINE_LABEL_KEY: Readonly<Record<string, "blocker" | "warning" | "suggestion">> = {
  CRITICAL: "blocker",
  WARNING: "warning",
  SUGGESTION: "suggestion",
};
