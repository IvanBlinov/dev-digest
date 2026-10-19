import picomatch from 'picomatch';
import type { ContextDocItem, ContextDocKind } from '@devdigest/shared';
import type { DocEntry, DocRead } from '../../adapters/docs/index.js';
import { scanSkillBody } from '../skills/injection.js';
import { CONTEXT_PATH_MAX, EXCLUDED_DOC_DIRS } from './constants.js';

/** Pure path rules for project-context documents. No I/O, no clone needed. */

export type RootMatcher = (path: string) => boolean;

/** True when any segment of the path is a directory the walk never enters (AC-62). */
export function isExcludedDocPath(path: string): boolean {
  return path
    .split('/')
    .some((seg) => (EXCLUDED_DOC_DIRS as readonly string[]).includes(seg));
}

/**
 * Compiles the root globs. `dot: true` so `.github/docs/x.md` matches; `.git/` and
 * `node_modules/` are excluded regardless of the globs (AC-62).
 */
export function makeRootMatcher(roots: readonly string[]): RootMatcher {
  const isMatch = picomatch([...roots], { dot: true });
  return (path) => !isExcludedDocPath(path) && isMatch(path);
}

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * AC-6: why a path may not be attached or previewed, or null when it passes. Needs no
 * clone. A control character is rejected too: the path lands on a prompt header line.
 */
export function contextPathError(path: string, matcher: RootMatcher): string | null {
  if (path.length === 0) return 'Path is empty';
  if (path.length > CONTEXT_PATH_MAX) return `Path is longer than ${CONTEXT_PATH_MAX} characters`;
  if (CONTROL_CHARS.test(path)) return 'Path contains a control character';
  if (path.startsWith('/') || /^[a-zA-Z]:/.test(path)) return 'Path must be relative';
  if (path.split('/').includes('..')) return 'Path must not contain a ".." segment';
  if (!path.endsWith('.md')) return 'Path must end in .md';
  if (!matcher(path)) return 'Path is outside the configured context roots';
  return null;
}

/** AC-3: `insights` for INSIGHTS.md or an `insights/` segment, else the nearest specs/docs segment. */
export function docKind(path: string): ContextDocKind {
  const segs = path.split('/');
  const file = segs[segs.length - 1] ?? '';
  const dirs = segs.slice(0, -1);
  if (file === 'INSIGHTS.md' || dirs.includes('insights')) return 'insights';
  for (let i = dirs.length - 1; i >= 0; i--) {
    if (dirs[i] === 'specs') return 'specs';
    if (dirs[i] === 'docs') return 'docs';
  }
  return 'docs';
}

/** AC-2: a size-based token estimate, `ceil(bytes / 4)`. */
export function tokensEstimate(size: number): number {
  return Math.ceil(size / 4);
}

/**
 * AC-5 / AC-7 / AC-31: turns walked entries and their reads into listing items. An entry
 * whose read failed (not UTF-8, unreadable, escaping the clone, gone) is dropped before
 * the cap. A file over the read cap stays listed, unscanned (a run still reads it, capped).
 * `truncated` is true when more valid documents remain than `cap`. Entries must be sorted.
 */
export function composeListing(
  entries: readonly DocEntry[],
  reads: ReadonlyMap<string, DocRead>,
  cap: number,
): { documents: ContextDocItem[]; truncated: boolean } {
  const valid: ContextDocItem[] = [];
  for (const e of entries) {
    const read = reads.get(e.path);
    if (!read) continue;
    if (!read.ok && read.reason !== 'too_large') continue;
    valid.push({
      path: e.path,
      kind: docKind(e.path),
      size: e.size,
      tokens_estimate: tokensEstimate(e.size),
      injection_detected: read.ok ? scanSkillBody(read.content).status === 'blocked' : false,
    });
  }
  return { documents: valid.slice(0, cap), truncated: valid.length > cap };
}
