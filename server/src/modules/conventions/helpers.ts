import {
  SKILL_BODY_MAX,
  type ConventionCandidate,
  type ConventionCategory,
  type ConventionScan,
  type ConventionSkillDraft,
  type ConventionStatus,
  type ExtractedConvention,
  type UpdateConventionBody,
} from '@devdigest/shared';
import {
  COMPACT_SNIPPET_LINES,
  DEFAULT_SKILL_NAME,
  FALLBACK_RULE_SLUG,
  LANGUAGE_BY_EXTENSION,
  LANGUAGE_BY_FILENAME,
  MAX_CANDIDATES_PER_SCAN,
  MAX_RULE_SLUG_CHARS,
  MAX_SNIPPET_LINES,
  STALE_SCAN_MS,
} from './constants.js';
import type { ConventionPatch, ConventionRow, ConventionScanRow, NewConvention } from './repository.js';
import type { SampleFile } from './sampler.js';

/**
 * Pure helpers for the conventions module (L03): grounding of model output,
 * the re-scan merge rule, ordering, PATCH mapping and the skill-draft builder.
 * No I/O.
 */

// ---- DTO mapping -----------------------------------------------------------

export function toCandidateDto(row: ConventionRow): ConventionCandidate {
  return {
    id: row.id,
    category: row.category,
    rule: row.rule,
    evidence_path: row.evidencePath ?? '',
    evidence_start_line: row.evidenceStartLine ?? null,
    evidence_end_line: row.evidenceEndLine ?? null,
    evidence_snippet: row.evidenceSnippet ?? '',
    confidence: clamp01(row.confidence ?? 0),
    status: row.status,
    accepted: row.status === 'accepted',
    edited: row.edited,
    created_at: row.createdAt.toISOString(),
  };
}

export function toScanDto(row: ConventionScanRow): ConventionScan {
  return {
    id: row.id,
    repo_id: row.repoId,
    status: row.status,
    sample_files: row.sampleFiles ?? [],
    provider: row.provider,
    model: row.model,
    candidates_found: row.candidatesFound ?? null,
    error: row.error ?? null,
    started_at: row.startedAt.toISOString(),
    finished_at: row.finishedAt ? row.finishedAt.toISOString() : null,
  };
}

// ---- grounding (req 40) ----------------------------------------------------

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** Lowercase, punctuation → space, collapsed whitespace. Used for dedupe and re-scan matching. */
export function normalizeRule(rule: string): string {
  return rule
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const normalizePath = (p: string): string => p.trim().replace(/^(\.\/)+/, '').replace(/^\/+/, '');

/**
 * Keep only candidates the samples prove: the cited file was sampled and the
 * (reordered) line range lies inside what the model saw. The snippet is cut
 * from the real lines (≤ MAX_SNIPPET_LINES; the range shrinks with it), the
 * confidence clamped, duplicates (by normalised rule) collapsed to the most
 * confident one, and the result capped at MAX_CANDIDATES_PER_SCAN.
 */
export function groundConventions(
  extracted: readonly ExtractedConvention[],
  files: readonly SampleFile[],
): NewConvention[] {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const byRule = new Map<string, NewConvention>();
  for (const c of extracted) {
    const file = byPath.get(normalizePath(c.evidence.file));
    if (!file) continue;
    let start = c.evidence.start_line;
    let end = c.evidence.end_line;
    if (start > end) [start, end] = [end, start];
    if (start < 1 || end > file.lineCount) continue;
    end = Math.min(end, start + MAX_SNIPPET_LINES - 1);
    const rule = c.rule.trim();
    const key = normalizeRule(rule);
    if (!key) continue;
    const grounded: NewConvention = {
      category: c.category,
      rule,
      evidencePath: file.path,
      startLine: start,
      endLine: end,
      snippet: file.lines.slice(start - 1, end).join('\n'),
      confidence: clamp01(c.confidence),
    };
    const prev = byRule.get(key);
    if (!prev || grounded.confidence > prev.confidence) byRule.set(key, grounded);
  }
  return [...byRule.values()]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_CANDIDATES_PER_SCAN);
}

// ---- re-scan merge ---------------------------------------------------------

export interface ExistingCandidate {
  id: string;
  status: ConventionStatus;
  edited: boolean;
  rule: string;
}

/**
 * Re-scan rule (spec Decisions): keep accepted, rejected and edited candidates;
 * delete the other pending ones; insert fresh candidates except those whose
 * normalised rule matches a kept one — a rejected rule never comes back.
 */
export function planRescan(
  existing: readonly ExistingCandidate[],
  fresh: readonly NewConvention[],
): { deleteIds: string[]; insert: NewConvention[] } {
  const isKept = (c: ExistingCandidate) => c.status !== 'pending' || c.edited;
  const keptRules = new Set(existing.filter(isKept).map((c) => normalizeRule(c.rule)));
  return {
    deleteIds: existing.filter((c) => !isKept(c)).map((c) => c.id),
    insert: fresh.filter((c) => !keptRules.has(normalizeRule(c.rule))),
  };
}

// ---- reads / writes --------------------------------------------------------

/** Accepted first, then confidence desc, then oldest first (stable for the UI). */
export function sortCandidates(list: readonly ConventionCandidate[]): ConventionCandidate[] {
  return [...list].sort((a, b) => {
    const acc = Number(b.status === 'accepted') - Number(a.status === 'accepted');
    if (acc !== 0) return acc;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.created_at.localeCompare(b.created_at);
  });
}

/** `UpdateConventionBody` → DB patch. Status keeps `accepted` in sync; content sets `edited`. */
export function toConventionPatch(body: UpdateConventionBody): ConventionPatch {
  const patch: ConventionPatch = {};
  if (body.status !== undefined) {
    patch.status = body.status;
    patch.accepted = body.status === 'accepted';
  }
  let content = false;
  const set = <K extends keyof ConventionPatch>(key: K, value: ConventionPatch[K] | undefined) => {
    if (value === undefined) return;
    patch[key] = value;
    content = true;
  };
  set('rule', body.rule?.trim());
  set('category', body.category as ConventionCategory | undefined);
  set('evidencePath', body.evidence_path);
  set('evidenceStartLine', body.evidence_start_line);
  set('evidenceEndLine', body.evidence_end_line);
  set('evidenceSnippet', body.evidence_snippet);
  if (content) patch.edited = true;
  return patch;
}

export function isStaleScan(
  scan: Pick<ConventionScanRow, 'status' | 'startedAt'>,
  now: Date = new Date(),
): boolean {
  return scan.status === 'running' && now.getTime() - scan.startedAt.getTime() > STALE_SCAN_MS;
}

// ---- skill draft (req 41) ---------------------------------------------------

export function ruleSlug(rule: string): string {
  const slug = rule
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) return FALLBACK_RULE_SLUG;
  if (slug.length <= MAX_RULE_SLUG_CHARS) return slug;
  const cut = slug.slice(0, MAX_RULE_SLUG_CHARS);
  const lastDash = cut.lastIndexOf('-');
  return lastDash > 0 ? cut.slice(0, lastDash) : cut;
}

export function languageForPath(path: string): string {
  const base = path.split('/').pop() ?? path;
  const byName = LANGUAGE_BY_FILENAME[base];
  if (byName !== undefined) return byName;
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return '';
  return LANGUAGE_BY_EXTENSION[base.slice(dot + 1).toLowerCase()] ?? '';
}

/** A backtick fence longer than any backtick run inside `text` (min 3). */
function fenceFor(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((r) => r.length));
  return '`'.repeat(Math.max(3, longest + 1));
}

function evidenceRef(c: ConventionCandidate): string {
  if (c.evidence_start_line == null) return c.evidence_path;
  const end = c.evidence_end_line ?? c.evidence_start_line;
  return `${c.evidence_path}:${c.evidence_start_line}-${end}`;
}

function section(c: ConventionCandidate, slug: string, snippetLines: number | null): string {
  const parts = [`## ${slug}`, c.rule.trim()];
  if (snippetLines === 0) {
    parts.push('', `Detected in \`${evidenceRef(c)}\`.`);
    return parts.join('\n');
  }
  parts.push('', `Detected in \`${evidenceRef(c)}\`:`);
  const snippet = c.evidence_snippet.replace(/\n+$/, '');
  const shown = snippetLines == null ? snippet : snippet.split('\n').slice(0, snippetLines).join('\n');
  const fence = fenceFor(shown);
  parts.push(`${fence}${languageForPath(c.evidence_path)}`, shown, fence);
  return parts.join('\n');
}

function renderBody(repoName: string, candidates: readonly ConventionCandidate[], snippetLines: number | null): string {
  const used = new Map<string, number>();
  const sections = candidates.map((c) => {
    const base = ruleSlug(c.rule);
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    return section(c, n === 1 ? base : `${base}-${n}`, snippetLines);
  });
  return [
    `# ${DEFAULT_SKILL_NAME}`,
    '',
    `House conventions for \`${repoName}\`. Flag changes that violate any rule below and cite the offending \`file:line\`.`,
    '',
    sections.join('\n\n'),
    '',
  ].join('\n');
}

/**
 * The editable starting point of the Create-skill modal: `# repo-conventions`,
 * the intro line, then one `## <rule-slug>` section per candidate (in the given
 * order). If the body would exceed SKILL_BODY_MAX, snippets are shortened, then
 * dropped, so the draft always saves.
 */
export function buildSkillDraft(repoName: string, candidates: readonly ConventionCandidate[]): ConventionSkillDraft {
  const n = candidates.length;
  let body = renderBody(repoName, candidates, null);
  if (body.length > SKILL_BODY_MAX) body = renderBody(repoName, candidates, COMPACT_SNIPPET_LINES);
  if (body.length > SKILL_BODY_MAX) body = renderBody(repoName, candidates, 0);
  return {
    name: DEFAULT_SKILL_NAME,
    description: `${n} house convention${n === 1 ? '' : 's'} extracted from ${repoName}`,
    type: 'convention',
    body: body.slice(0, SKILL_BODY_MAX),
  };
}
