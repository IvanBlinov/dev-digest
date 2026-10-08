import type { ConventionCandidate } from "@devdigest/shared";
import { CONFIDENCE_HIGH, CONFIDENCE_MEDIUM } from "./constants";

export function confidenceColor(confidence: number): string {
  if (confidence >= CONFIDENCE_HIGH) return "var(--ok)";
  if (confidence >= CONFIDENCE_MEDIUM) return "var(--warn)";
  return "var(--crit)";
}

export const confidencePercent = (confidence: number) => Math.round(Math.max(0, Math.min(1, confidence)) * 100);

/** `path:start-end`, `path:start` for a single line, or just `path` without lines. */
export function evidenceLabel(c: Pick<ConventionCandidate, "evidence_path" | "evidence_start_line" | "evidence_end_line">): string {
  const { evidence_path: path, evidence_start_line: start, evidence_end_line: end } = c;
  if (start == null) return path;
  if (end == null || end === start) return `${path}:${start}`;
  return `${path}:${start}-${end}`;
}
