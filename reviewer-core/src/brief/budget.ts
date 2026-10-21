import type { BriefPromptInput } from './prompt.js';

/** Token budget for the single brief request (SPEC-03 AC-19). */
export const BRIEF_BUDGET = {
  totalTokens: 12_000,
  specTokens: 4_000,
  issueTokens: 2_000,
  descriptionTokens: 1_500,
  maxFiles: 300,
  maxCallers: 50,
  maxHeadersPerFile: 10,
  maxHeaderChars: 160,
} as const;

/** Output cap passed as `max_tokens` (AC-21). */
export const BRIEF_MAX_OUTPUT_TOKENS = 2_000;

export interface BriefTrimReport {
  docsDropped: string[];
  issuesDropped: string[];
  issuesTruncated: boolean;
  descriptionTruncated: boolean;
  callersShown: number;
  callersTotal: number;
  headersDropped: boolean;
  filesShown: number;
  filesTotal: number;
  totalTokens: number;
}

type Count = (text: string) => number;

/** Longest prefix of `text` that fits `max` tokens (binary search; the tokenizer is injected). */
function clipToTokens(text: string, max: number, count: Count): string {
  if (max <= 0) return '';
  if (count(text) <= max) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (count(text.slice(0, mid)) <= max) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo);
}

/**
 * Fit the brief input into the budget. Hard caps first (description, issues, documents,
 * files, callers), then, while the rendered prompt is still over the total, trim in this order:
 * whole documents (last first) → issue text → callers (tail first) → hunk headers →
 * files (smallest +/- first). Intent and the blast summary line are never removed.
 */
export function fitBriefBudget(
  input: BriefPromptInput,
  render: (i: BriefPromptInput) => string,
  countTokens: Count,
): { input: BriefPromptInput; trim: BriefTrimReport } {
  const trim: BriefTrimReport = {
    docsDropped: [],
    issuesDropped: [],
    issuesTruncated: false,
    descriptionTruncated: false,
    callersShown: input.blast?.callers.length ?? 0,
    callersTotal: input.blast?.callers.length ?? 0,
    headersDropped: false,
    filesShown: input.files.length,
    filesTotal: input.files.length,
    totalTokens: 0,
  };

  // --- hard caps ---
  let body = input.body;
  if (countTokens(body) > BRIEF_BUDGET.descriptionTokens) {
    body = clipToTokens(body, BRIEF_BUDGET.descriptionTokens, countTokens);
    trim.descriptionTruncated = true;
  }

  let issues = [...input.issues];
  let issueLeft = BRIEF_BUDGET.issueTokens;
  const cappedIssues: typeof issues = [];
  for (const issue of issues) {
    const clipped = clipToTokens(issue.text, issueLeft, countTokens);
    if (clipped.length === 0 && issue.text.length > 0) {
      trim.issuesDropped.push(issue.ref);
      continue;
    }
    if (clipped.length < issue.text.length) trim.issuesTruncated = true;
    issueLeft -= countTokens(clipped);
    cappedIssues.push({ ref: issue.ref, text: clipped });
  }
  issues = cappedIssues;

  let docs = [...input.docs];
  while (docs.length > 0 && docs.reduce((n, d) => n + countTokens(d.text), 0) > BRIEF_BUDGET.specTokens) {
    const last = docs[docs.length - 1]!;
    trim.docsDropped.push(last.ref);
    docs = docs.slice(0, -1);
  }

  const bySize = (a: { additions: number; deletions: number }, b: { additions: number; deletions: number }) =>
    b.additions + b.deletions - (a.additions + a.deletions);
  let files = [...input.files].sort(bySize).slice(0, BRIEF_BUDGET.maxFiles);
  let blast = input.blast
    ? { ...input.blast, callers: input.blast.callers.slice(0, BRIEF_BUDGET.maxCallers) }
    : null;

  const current = (): BriefPromptInput => ({ ...input, body, issues, docs, files, blast });

  // --- trim while over the total ---
  const over = () => countTokens(render(current())) > BRIEF_BUDGET.totalTokens;
  while (over()) {
    if (docs.length > 0) {
      trim.docsDropped.push(docs[docs.length - 1]!.ref);
      docs = docs.slice(0, -1);
    } else if (issues.some((i) => i.text.length > 0)) {
      const excess = countTokens(render(current())) - BRIEF_BUDGET.totalTokens;
      let idx = issues.length - 1;
      while (idx > 0 && issues[idx]!.text.length === 0) idx -= 1;
      const target = issues[idx]!;
      const keep = clipToTokens(target.text, Math.max(0, countTokens(target.text) - excess), countTokens);
      if (keep.length === 0) {
        trim.issuesDropped.push(target.ref);
        issues = issues.filter((_, n) => n !== idx);
      } else {
        issues = issues.map((i, n) => (n === idx ? { ...i, text: keep } : i));
      }
      trim.issuesTruncated = true;
    } else if (blast && blast.callers.length > 0) {
      blast = { ...blast, callers: blast.callers.slice(0, -1) };
    } else if (files.some((f) => f.hunkHeaders.length > 0)) {
      files = files.map((f) => ({ ...f, hunkHeaders: [] }));
      trim.headersDropped = true;
    } else if (files.length > 0) {
      files = files.slice(0, -1);
    } else {
      break;
    }
  }

  const result = current();
  trim.callersShown = result.blast?.callers.length ?? 0;
  trim.filesShown = result.files.length;
  trim.totalTokens = countTokens(render(result));
  return { input: result, trim };
}
