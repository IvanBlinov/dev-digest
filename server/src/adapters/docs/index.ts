/**
 * docs adapter — read-only access to the documents of a repo clone (L05 project context).
 *
 * The port owns every file-system detail: walking the clone, pruning `.git/` and
 * `node_modules/`, symlink containment and strict UTF-8 decoding. Services only see
 * relative paths and a result union; they never touch `node:fs`.
 *
 * Swappable in tests via `ContainerOverrides.docs` (`MockDocsReader`).
 */
export type DocReadFailure =
  | 'not_found'
  | 'unreadable'
  | 'not_utf8'
  | 'invalid_path'
  | 'too_large';

export type DocRead =
  | { ok: true; content: string; size: number }
  | { ok: false; reason: DocReadFailure };

export interface DocEntry {
  /** Path relative to the clone root, `/`-separated. */
  path: string;
  /** Size in bytes. */
  size: number;
}

export interface DocsReader {
  /** Files under `root` whose relative path passes `match`, sorted by path. */
  list(root: string, match: (path: string) => boolean): Promise<DocEntry[]>;
  /** Reads one file by relative path; every failure is a value, never a throw. */
  read(root: string, path: string, opts?: { maxBytes?: number }): Promise<DocRead>;
}

export { FsDocsReader } from './fs.js';
