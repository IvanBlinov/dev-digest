import { createHash } from 'node:crypto';
import type {
  IntentClassification,
  IntentSource,
  PrIntentRecord,
  PrIntentStaleReason,
} from '@devdigest/shared';
import {
  MAX_DOCS,
  MAX_HEADERS_PER_FILE,
  MAX_HEADER_CHARS,
  MAX_ISSUES,
  MAX_MISSING_ITEMS,
  MAX_REF_CHARS,
  MAX_SCOPE_ITEMS,
  MAX_SCOPE_ITEM_CHARS,
  MAX_SUMMARY_CHARS,
  MAX_UNRESOLVED,
  DOC_EXTENSIONS,
} from './constants.js';
import type { IntentRow } from './repository.js';

/** Pure helpers for the intent module: reference parsing, hunk headers, staleness, clamping. */

export interface ExtractedRefs {
  /** Same-repo issue numbers to fetch (≤ 3, priority order). */
  issues: number[];
  /** Same-repo repo-relative docs to fetch (≤ 3). */
  docs: { path: string; kind: 'spec' | 'plan' }[];
  /** Refs we will not fetch, already carrying their final status (≤ 5). */
  unresolved: IntentSource[];
}

const clip = (s: string, n: number): string => (s.length > n ? s.slice(0, n) : s);

/** `host/path` with no scheme, userinfo, query string or fragment; clipped. */
export function sanitizeRef(raw: string): string {
  try {
    const u = new URL(raw);
    return clip(`${u.host}${u.pathname}`.replace(/\/+$/, ''), MAX_REF_CHARS);
  } catch {
    return clip(raw.split(/[?#]/)[0] ?? '', MAX_REF_CHARS);
  }
}

const EXT = DOC_EXTENSIONS.join('|');
const URL_RE = /https?:\/\/[^\s)>\]"'<]+/gi;
const CLOSING_RE = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+#(\d{1,7})\b/gi;
const QUALIFIED_RE = /(?<![\w./-])([\w.-]+)\/([\w.-]+)#(\d{1,7})\b/g;
const BARE_RE = /(?<![\w/&#])#(\d{1,7})\b/g;
const PATH_RE = new RegExp(`(?<![\\w:.@-])(\\/?(?:[\\w.-]+\\/)*[\\w.-]+\\.(?:${EXT}))(?![\\w/-])`, 'g');
const TICKET_RE = /\b([A-Z][A-Z0-9]{1,9}-\d{1,6})\b/g;
const NOT_TICKETS = new Set(['UTF', 'SHA', 'ISO', 'CVE', 'AES', 'RSA', 'TLS', 'HTTP', 'MD', 'ES', 'RFC', 'GPT', 'PEP', 'X']);

const sameRepo = (o: string, n: string, repo: { owner: string; name: string }): boolean =>
  o.toLowerCase() === repo.owner.toLowerCase() && n.toLowerCase() === repo.name.toLowerCase();

function docKind(path: string): 'spec' | 'plan' {
  return /plan/i.test(path) ? 'plan' : 'spec';
}

function isSafeRepoPath(p: string): boolean {
  if (p.startsWith('/') || p.includes('\\') || p.includes(':')) return false;
  return !p.split('/').some((seg) => seg === '..' || seg === '');
}

/**
 * Find tickets and plan/spec links in the PR title + body. Same-repo GitHub
 * issues and repo-relative docs are returned for fetching; everything else is
 * recorded with a final status and never fetched (no arbitrary URL fetch).
 */
export function extractReferences(input: {
  title: string;
  body: string;
  repo: { owner: string; name: string };
}): ExtractedRefs {
  const text = `${input.title}\n${input.body}`;
  const issues: number[] = [];
  const docs: { path: string; kind: 'spec' | 'plan' }[] = [];
  const unresolved: IntentSource[] = [];
  const addIssue = (n: number) => {
    if (!issues.includes(n)) issues.push(n);
  };
  const addDoc = (path: string) => {
    if (!docs.some((d) => d.path === path)) docs.push({ path, kind: docKind(path) });
  };
  const addUnresolved = (s: IntentSource) => {
    if (!unresolved.some((u) => u.ref === s.ref && u.kind === s.kind)) unresolved.push(s);
  };

  // 1. closing keywords have priority for the 3-issue cap
  for (const m of text.matchAll(CLOSING_RE)) addIssue(Number(m[1]));

  // 2. URLs
  for (const m of text.matchAll(URL_RE)) {
    const raw = m[0].replace(/[.,;:]+$/, '');
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      continue;
    }
    const ref = sanitizeRef(raw);
    const seg = u.pathname.split('/').filter(Boolean);
    if (u.host.toLowerCase() === 'github.com' && seg.length >= 4 && (seg[2] === 'issues' || seg[2] === 'blob')) {
      const [owner, name, kind] = seg as [string, string, string];
      const own = sameRepo(owner, name, input.repo);
      if (kind === 'issues') {
        const n = Number(seg[3]);
        if (!Number.isInteger(n)) continue;
        if (own) addIssue(n);
        else addUnresolved({ kind: 'issue', ref, status: 'not_allowlisted' });
      } else {
        const path = seg.slice(4).join('/');
        if (!own) addUnresolved({ kind: docKind(path), ref, status: 'not_allowlisted' });
        else if (new RegExp(`\\.(${EXT})$`, 'i').test(path) && isSafeRepoPath(path)) addDoc(path);
        else addUnresolved({ kind: docKind(path), ref, status: 'unsupported' });
      }
    } else if (u.host.toLowerCase() === 'github.com' && seg[2] === 'pull') {
      continue; // PR cross-references carry no intent text we fetch
    } else {
      addUnresolved({ kind: 'link', ref, status: 'not_allowlisted' });
    }
  }

  const noUrls = text.replace(URL_RE, ' ');

  // 3. owner/repo#N
  for (const m of noUrls.matchAll(QUALIFIED_RE)) {
    const [, owner, name, n] = m as unknown as [string, string, string, string];
    if (sameRepo(owner, name, input.repo)) addIssue(Number(n));
    else addUnresolved({ kind: 'issue', ref: clip(`${owner}/${name}#${n}`, MAX_REF_CHARS), status: 'not_allowlisted' });
  }
  // 4. bare #N (not part of owner/repo#N)
  for (const m of noUrls.replace(QUALIFIED_RE, ' ').matchAll(BARE_RE)) addIssue(Number(m[1]));

  // 5. repo-relative docs
  for (const m of noUrls.matchAll(PATH_RE)) {
    const p = m[1]!;
    if (isSafeRepoPath(p)) addDoc(p);
    else addUnresolved({ kind: docKind(p), ref: clip(p, MAX_REF_CHARS), status: 'not_allowlisted' });
  }

  // 6. ticket keys (Jira/Linear style) — recorded, not fetched
  for (const m of noUrls.matchAll(TICKET_RE)) {
    const key = m[1]!;
    if (NOT_TICKETS.has(key.split('-')[0]!)) continue;
    addUnresolved({ kind: 'link', ref: key, status: 'unsupported' });
  }

  return {
    issues: issues.slice(0, MAX_ISSUES),
    docs: docs.slice(0, MAX_DOCS),
    unresolved: unresolved.slice(0, MAX_UNRESOLVED),
  };
}

/**
 * `@@ … @@ <ctx>` header lines per file path, taken from the raw unified diff.
 * Hunk BODY lines are never returned (they cannot start with `@@`).
 */
export function extractHunkHeaders(raw: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  let current: string | null = null;
  for (const line of raw.split('\n')) {
    if (line.startsWith('diff --git ')) {
      const m = /^diff --git a\/.+ b\/(.+)$/.exec(line);
      current = m ? m[1]! : null;
      if (current) out[current] = out[current] ?? [];
    } else if (current && line.startsWith('@@')) {
      const list = out[current]!;
      if (list.length < MAX_HEADERS_PER_FILE) list.push(clip(line.trimEnd(), MAX_HEADER_CHARS));
    }
  }
  return out;
}

export function intentInputHash(i: { promptVersion: string; title: string; body: string }): string {
  return createHash('sha256').update(JSON.stringify([i.promptVersion, i.title, i.body])).digest('hex');
}

/** Why a stored intent no longer matches the PR, or null when it is fresh. */
export function deriveStaleness(
  stored: { headSha: string | null; inputHash: string | null; promptVersion: string | null },
  current: { headSha: string; title: string; body: string; promptVersion: string },
): PrIntentStaleReason | null {
  if (stored.promptVersion !== current.promptVersion) return 'prompt_updated';
  if (stored.headSha !== current.headSha) return 'head_moved';
  if (stored.inputHash !== intentInputHash(current)) return 'description_changed';
  return null;
}

const cleanList = (items: string[], max: number, itemChars: number): string[] =>
  items
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, max)
    .map((s) => clip(s, itemChars));

/** The LLM schema has no length limits (strict json_schema); enforce them here. */
export function clampClassification(c: IntentClassification): IntentClassification {
  return {
    summary: clip(c.summary.trim(), MAX_SUMMARY_CHARS),
    in_scope: cleanList(c.in_scope, MAX_SCOPE_ITEMS, MAX_SCOPE_ITEM_CHARS),
    out_of_scope: cleanList(c.out_of_scope, MAX_SCOPE_ITEMS, MAX_SCOPE_ITEM_CHARS),
    confidence: c.confidence,
    missing_context: cleanList(c.missing_context, MAX_MISSING_ITEMS, MAX_SCOPE_ITEM_CHARS),
  };
}

export function toIntentRecordDto(
  prId: string,
  row: IntentRow,
  staleReason: PrIntentStaleReason | null,
): PrIntentRecord {
  return {
    pr_id: prId,
    summary: row.summary,
    in_scope: row.inScope,
    out_of_scope: row.outOfScope,
    confidence: row.confidence,
    sources: row.sources,
    missing_context: row.missingContext,
    head_sha: row.headSha,
    provider: row.provider,
    model: row.model,
    prompt_version: row.promptVersion,
    tokens_in: row.tokensIn,
    tokens_out: row.tokensOut,
    duration_ms: row.durationMs,
    cost_usd: row.costUsd,
    detected_at: row.detectedAt.toISOString(),
    stale: staleReason !== null,
    stale_reason: staleReason,
  };
}
