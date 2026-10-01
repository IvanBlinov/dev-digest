import type { Skill, SkillSource, SkillType, SkillVersion } from '@devdigest/shared';
import { SKILL_NAME_MAX, SKILL_NAME_MIN } from './constants.js';
import type { SkillRow, SkillVersionRow, SkillContentPatch } from './repository.js';
import { scanSkillBody } from './injection.js';

/**
 * Pure helpers for the skills module — row ⇄ DTO mapping, the version-bump
 * rule, name slugification and link-payload validation. No I/O.
 */

export function toSkillDto(row: SkillRow, agentCount: number): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
    agent_count: agentCount,
    created_at: row.createdAt.toISOString(),
    security: scanSkillBody(row.body),
  };
}

export function toSkillVersionDto(row: SkillVersionRow): SkillVersion {
  return {
    version: row.version,
    body: row.body,
    message: row.message ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

/** True when the patch changes versioned content (anything but `enabled`). */
export function isContentChange(
  existing: Pick<SkillRow, 'name' | 'description' | 'type' | 'body'>,
  patch: SkillContentPatch,
): boolean {
  return (
    (patch.name !== undefined && patch.name !== existing.name) ||
    (patch.description !== undefined && patch.description !== existing.description) ||
    (patch.type !== undefined && patch.type !== existing.type) ||
    (patch.body !== undefined && patch.body !== existing.body)
  );
}

/**
 * Kebab-case slug that satisfies `SkillName` (2–64 chars, `[a-z0-9][a-z0-9-]*`),
 * or null when nothing usable remains.
 */
export function slugifySkillName(input: string): string | null {
  const slug = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SKILL_NAME_MAX)
    .replace(/-+$/, '');
  return slug.length >= SKILL_NAME_MIN ? slug : null;
}

/**
 * Validate an ordered `items` replacement for `POST /agents/:id/skills`:
 * no duplicates, every id belongs to the workspace. Returns an error message or null.
 */
export function validateLinkItems(
  items: ReadonlyArray<{ skill_id: string; enabled: boolean }>,
  knownIds: ReadonlySet<string>,
): string | null {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.skill_id)) return `Duplicate skill_id ${item.skill_id}`;
    seen.add(item.skill_id);
    if (!knownIds.has(item.skill_id)) return `Skill ${item.skill_id} not found in this workspace`;
  }
  return null;
}

/**
 * Postgres unique_violation (23505), possibly wrapped by drizzle in `cause`.
 * With `constraint`, only a clash on that constraint/index matches (postgres-js
 * exposes it as `constraint_name`; some drivers use `constraint`) — so e.g. a
 * `skill_versions` PK clash is never mistaken for a duplicate skill name.
 */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: unknown; cause?: unknown; constraint_name?: unknown; constraint?: unknown };
  if (e.code === '23505') {
    if (constraint === undefined) return true;
    if (e.constraint_name === constraint || e.constraint === constraint) return true;
  }
  return isUniqueViolation(e.cause, constraint);
}

// ---- L03c: import from a URL ------------------------------------------------

const GITHUB_HOSTS = new Set(['github.com', 'www.github.com']);
const TEXT_EXTENSIONS = ['.md', '.markdown', '.txt'];
const TEXT_MIME_TYPES = new Set(['text/markdown', 'text/plain']);
const HTML_MIME_TYPES = new Set(['text/html', 'application/xhtml+xml']);

/**
 * Trim, and rewrite a GitHub file view (`github.com/<o>/<r>/blob|raw/<ref>/<path>`)
 * to `raw.githubusercontent.com/<o>/<r>/<ref>/<path>` (query + hash dropped).
 * Everything else — including unparseable input — is returned trimmed; the
 * fetcher is the one that validates scheme and host.
 */
export function normalizeSkillUrl(input: string): string {
  const trimmed = input.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return trimmed;
  }
  if (!GITHUB_HOSTS.has(url.hostname.toLowerCase())) return trimmed;
  const m = /^\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/.exec(url.pathname);
  if (!m) return trimmed;
  return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`;
}

/** Last path segment of a URL, percent-decoded when possible ('' for `/`). */
export function urlFileName(url: string): string {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return '';
  }
  const last = pathname.split('/').pop() ?? '';
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

/**
 * Why a fetched URL is not an importable text file, or null when it is:
 * content type `text/markdown` / `text/plain`, or a `.md` / `.markdown` / `.txt`
 * path served as `text/*`, `application/octet-stream` or without a type.
 * HTML pages (a GitHub blob view, a docs site) get a hint to use the raw link.
 */
export function textFileRejection(url: string, contentType: string | null): string | null {
  const mime = contentType?.split(';')[0]?.trim().toLowerCase() || null;
  if (mime && HTML_MIME_TYPES.has(mime)) {
    return 'The URL points to an HTML page, not a text file — use the raw file link (e.g. "Raw" on GitHub)';
  }
  if (mime && TEXT_MIME_TYPES.has(mime)) return null;
  const path = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return '';
    }
  })();
  const hasTextExtension = TEXT_EXTENSIONS.some((ext) => path.endsWith(ext));
  const textish = mime === null || mime.startsWith('text/') || mime === 'application/octet-stream';
  if (hasTextExtension && textish) return null;
  return `The URL is not a text file — link a .md, .markdown or .txt file (content type: ${mime ?? 'none'})`;
}

export function isAcceptedTextFile(url: string, contentType: string | null): boolean {
  return textFileRejection(url, contentType) === null;
}
