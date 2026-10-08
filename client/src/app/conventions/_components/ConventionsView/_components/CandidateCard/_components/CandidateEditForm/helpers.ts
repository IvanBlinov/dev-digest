import type { ConventionCandidate, ConventionCategory, UpdateConventionBody } from "@devdigest/shared";
import { RULE_MAX, RULE_MIN, SNIPPET_MAX } from "./constants";

/** The form's local state: line numbers stay strings so the inputs can be emptied. */
export interface EditDraft {
  rule: string;
  category: ConventionCategory;
  path: string;
  start: string;
  end: string;
  snippet: string;
}

export type EditErrorKey = "ruleTooShort" | "pathRequired" | "linesInvalid";

export function fromCandidate(c: ConventionCandidate): EditDraft {
  return {
    rule: c.rule,
    category: c.category,
    path: c.evidence_path,
    start: c.evidence_start_line == null ? "" : String(c.evidence_start_line),
    end: c.evidence_end_line == null ? "" : String(c.evidence_end_line),
    snippet: c.evidence_snippet,
  };
}

/** "" → null; otherwise a positive integer or NaN. */
function parseLine(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  return /^\d+$/.test(t) ? Number(t) : Number.NaN;
}

const validLine = (n: number | null) => n === null || (Number.isInteger(n) && n >= 1);

export function validateDraft(d: EditDraft): EditErrorKey[] {
  const errors: EditErrorKey[] = [];
  const rule = d.rule.trim();
  if (rule.length < RULE_MIN || rule.length > RULE_MAX) errors.push("ruleTooShort");
  if (!d.path.trim()) errors.push("pathRequired");
  const start = parseLine(d.start);
  const end = parseLine(d.end);
  const rangeOk = validLine(start) && validLine(end) && (start === null || end === null || end >= start);
  if (!rangeOk || d.snippet.length > SNIPPET_MAX) errors.push("linesInvalid");
  return errors;
}

export function toPatch(d: EditDraft): UpdateConventionBody {
  return {
    rule: d.rule.trim(),
    category: d.category,
    evidence_path: d.path.trim(),
    evidence_start_line: parseLine(d.start),
    evidence_end_line: parseLine(d.end),
    evidence_snippet: d.snippet,
  };
}
