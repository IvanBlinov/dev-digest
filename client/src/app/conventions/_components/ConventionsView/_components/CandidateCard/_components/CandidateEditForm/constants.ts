import type { ConventionCategory } from "@devdigest/shared";

/** Mirrors `ConventionCategory` (contracts/knowledge.ts) — runtime values can't be imported from shared. */
export const CONVENTION_CATEGORIES: readonly ConventionCategory[] = [
  "naming",
  "structure",
  "imports",
  "error-handling",
  "async",
  "typing",
  "testing",
  "formatting",
  "other",
];

/** Mirrors the `rule` bounds of `UpdateConventionBody`. */
export const RULE_MIN = 3;
export const RULE_MAX = 300;
/** Mirrors `evidence_snippet` max of `UpdateConventionBody`. */
export const SNIPPET_MAX = 4000;
