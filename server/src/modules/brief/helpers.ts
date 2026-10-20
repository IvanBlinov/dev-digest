import { createHash } from 'node:crypto';
import type {
  BlastRadius,
  BriefInput,
  BriefInputStatus,
  BriefModelOutput,
  BriefStaleReason,
  IntentSource,
  PrBrief,
  ReviewFocusItem,
  Risk,
  RiskRef,
} from '@devdigest/shared';
import type { BriefTrimReport } from '@devdigest/reviewer-core';
import { AppError } from '../../platform/errors.js';
import {
  MAX_FOCUS,
  MAX_REF_CHARS,
  MAX_RISKS,
  MAX_RISK_TITLE_CHARS,
  MAX_SUMMARY_CHARS,
  MAX_TEXT_CHARS,
} from './constants.js';

/** Pure helpers for the brief module: hunk parsing, post-validation, staleness, provenance. */

const MAX_HEADERS = 10;
const MAX_HEADER_CHARS = 160;
const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

const clip = (s: string, n: number): string => (s.length > n ? s.slice(0, n) : s);

/** AC-27: trim whitespace and strip exactly one leading './'. */
export function normalizeBriefPath(p: string): string {
  const t = p.trim();
  return t.startsWith('./') ? t.slice(2) : t;
}

/** `@@ … @@` lines of one file's patch (≤ 10, ≤ 160 chars). Hunk body lines are never returned. */
export function hunkHeaders(patch: string | null): string[] {
  if (!patch) return [];
  const out: string[] = [];
  for (const line of patch.split('\n')) {
    if (!line.startsWith('@@')) continue;
    out.push(clip(line.trimEnd(), MAX_HEADER_CHARS));
    if (out.length >= MAX_HEADERS) break;
  }
  return out;
}

/** New-side and old-side line ranges of every hunk (a count-less header means one line; count 0 is skipped). */
export function hunkRanges(patch: string | null): { newRanges: [number, number][]; oldRanges: [number, number][] } {
  const newRanges: [number, number][] = [];
  const oldRanges: [number, number][] = [];
  if (!patch) return { newRanges, oldRanges };
  for (const line of patch.split('\n')) {
    const m = HUNK_RE.exec(line);
    if (!m) continue;
    const oldStart = Number(m[1]);
    const oldCount = m[2] === undefined ? 1 : Number(m[2]);
    const newStart = Number(m[3]);
    const newCount = m[4] === undefined ? 1 : Number(m[4]);
    if (oldCount > 0) oldRanges.push([oldStart, oldStart + oldCount - 1]);
    if (newCount > 0) newRanges.push([newStart, newStart + newCount - 1]);
  }
  return { newRanges, oldRanges };
}

const usableBlast = (blast: BlastRadius | null): BlastRadius | null => (blast && !blast.degraded ? blast : null);

/** AC-23: changed files plus (blast not degraded) changed-symbol files and caller files. */
export function allowedBriefFiles(changed: string[], blast: BlastRadius | null): Set<string> {
  const allowed = new Set(changed.map(normalizeBriefPath));
  const b = usableBlast(blast);
  if (!b) return allowed;
  for (const s of b.changed_symbols) allowed.add(normalizeBriefPath(s.file));
  for (const d of b.downstream) for (const c of d.callers) allowed.add(normalizeBriefPath(c.file));
  return allowed;
}

const SEVERITY_RANK = { high: 0, medium: 1, low: 2 } as const;

const inRanges = (line: number, ranges: [number, number][]): boolean =>
  ranges.some(([a, b]) => line >= a && line <= b);

/**
 * Post-validation of the model output (R4 order): normalise paths → drop refs / focus items
 * outside the PR and its blast radius (AC-23, AC-25) → drop risks left without refs (AC-24) →
 * dedupe focus → sort risks (AC-29) → clamp lengths and counts (AC-28).
 * `dropped` counts only AC-23/24/25 drops; duplicates and clamped surplus are not counted.
 */
export function validateBriefOutput(
  out: BriefModelOutput,
  ctx: { files: { path: string; patch: string | null }[]; blast: BlastRadius | null },
): { summary: string; risks: Risk[]; review_focus: ReviewFocusItem[]; dropped: { risks: number; review_focus: number } } {
  const byPath = new Map(ctx.files.map((f) => [normalizeBriefPath(f.path), f.patch] as const));
  const allowed = allowedBriefFiles([...byPath.keys()], ctx.blast);
  const b = usableBlast(ctx.blast);
  const callerLines = new Map<string, Set<number>>();
  for (const d of b?.downstream ?? []) {
    for (const c of d.callers) {
      const key = normalizeBriefPath(c.file);
      callerLines.set(key, (callerLines.get(key) ?? new Set()).add(c.line));
    }
  }

  let droppedRisks = 0;
  const risks: Risk[] = [];
  for (const r of out.risks) {
    const refs: RiskRef[] = r.refs
      .map((ref) => ({ ...ref, file: normalizeBriefPath(ref.file) }))
      .filter((ref) => allowed.has(ref.file));
    if (refs.length === 0) {
      droppedRisks += 1;
      continue;
    }
    risks.push({
      kind: clip(r.kind.trim(), MAX_RISK_TITLE_CHARS),
      title: clip(r.title.trim(), MAX_RISK_TITLE_CHARS),
      explanation: clip(r.explanation.trim(), MAX_TEXT_CHARS),
      severity: r.severity,
      refs,
    });
  }

  let droppedFocus = 0;
  const seen = new Set<string>();
  const focus: ReviewFocusItem[] = [];
  for (const f of out.review_focus) {
    const file = normalizeBriefPath(f.file);
    let ok = false;
    if (byPath.has(file)) {
      const { newRanges, oldRanges } = hunkRanges(byPath.get(file) ?? null);
      ok = inRanges(f.line, newRanges.length > 0 ? newRanges : oldRanges);
    }
    if (!ok && allowed.has(file)) ok = callerLines.get(file)?.has(f.line) === true;
    if (!ok) {
      droppedFocus += 1;
      continue;
    }
    const key = `${file}:${f.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    focus.push({ file, line: f.line, reason: clip(f.reason.trim(), MAX_TEXT_CHARS) });
  }

  const sorted = risks
    .map((r, i) => ({ r, i }))
    .sort((a, b2) => SEVERITY_RANK[a.r.severity] - SEVERITY_RANK[b2.r.severity] || a.i - b2.i)
    .map((x) => x.r);

  return {
    summary: clip(out.summary.trim(), MAX_SUMMARY_CHARS),
    risks: sorted.slice(0, MAX_RISKS),
    review_focus: focus.slice(0, MAX_FOCUS),
    dropped: { risks: droppedRisks, review_focus: droppedFocus },
  };
}

/** sha256 of JSON `[title, body]` (not the prompt version: that is checked separately). */
export function briefInputHash(title: string, body: string): string {
  return createHash('sha256').update(JSON.stringify([title, body])).digest('hex');
}

/** Same check order as the intent module's `deriveStaleness`. */
export function briefStaleness(
  stored: Pick<PrBrief, 'prompt_version' | 'head_sha' | 'input_hash'>,
  current: { headSha: string; title: string; body: string; promptVersion: string },
): BriefStaleReason | null {
  if (stored.prompt_version !== current.promptVersion) return 'prompt_updated';
  if (stored.head_sha !== current.headSha) return 'head_moved';
  if (stored.input_hash !== briefInputHash(current.title, current.body)) return 'description_changed';
  return null;
}

const CONTROL_RE = /[\u0000-\u001f\u007f]+/g;
const cleanRef = (s: string): string => clip(s.replace(CONTROL_RE, ' ').trim(), MAX_REF_CHARS);

/** AC-30: one provenance entry per input, in a fixed order. No text, only refs and statuses. */
export function buildBriefProvenance(i: {
  intent: 'none' | 'ok' | 'stale';
  blast: BlastRadius | 'unavailable';
  trim: BriefTrimReport;
  body: string;
  issues: IntentSource[];
  docs: { ref: string; status: BriefInputStatus }[];
}): BriefInput[] {
  const out: BriefInput[] = [];
  out.push({
    kind: 'intent',
    ref: 'intent',
    status: i.intent === 'none' ? 'missing' : i.intent === 'stale' ? 'stale' : 'ok',
  });
  if (i.blast === 'unavailable') {
    out.push({ kind: 'blast', ref: 'blast radius', status: 'unavailable' });
  } else if (i.blast.degraded) {
    out.push({ kind: 'blast', ref: 'blast radius', status: 'degraded', reason: i.blast.reason ?? null });
  } else {
    out.push({ kind: 'blast', ref: 'blast radius', status: 'ok' });
  }
  out.push({
    kind: 'files',
    ref: 'changed files',
    status: i.trim.filesShown < i.trim.filesTotal ? 'truncated' : 'ok',
    shown: i.trim.filesShown,
    total: i.trim.filesTotal,
  });
  out.push({
    kind: 'pr_description',
    ref: 'description',
    status: i.body.trim() === '' ? 'missing' : i.trim.descriptionTruncated ? 'truncated' : 'ok',
  });
  for (const s of i.issues) {
    const status: BriefInputStatus = s.status !== 'ok' ? 'unavailable' : i.trim.issuesDropped.includes(s.ref) ? 'over_budget' : 'ok';
    out.push({ kind: 'issue', ref: cleanRef(s.ref), status });
  }
  for (const d of i.docs) {
    out.push({ kind: 'spec', ref: cleanRef(d.ref), status: i.trim.docsDropped.includes(d.ref) ? 'over_budget' : d.status });
  }
  return out;
}

/** Q2: the 429 body carries only `retry_after_s` (AppError.details is sent to the client). */
export function rateLimitError(ttlMs: number): AppError {
  return new AppError('rate_limited', 'Too many brief generations — try again shortly', 429, {
    retry_after_s: Math.max(1, Math.ceil(ttlMs / 1000)),
  });
}
