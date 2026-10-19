import { open, readdir, realpath, stat, readFile } from 'node:fs/promises';
import { join, sep } from 'node:path';
import type { DocEntry, DocRead, DocsReader } from './index.js';

/** Directory names never entered and never readable, at any depth. */
const EXCLUDED = new Set(['.git', 'node_modules']);

function isInside(root: string, target: string): boolean {
  return target === root || target.startsWith(root + sep);
}

function hasUnsafeSegment(path: string): boolean {
  if (path.length === 0 || path.startsWith('/') || path.includes('\0')) return true;
  return path.split('/').some((seg) => seg === '..' || EXCLUDED.has(seg));
}

/** Files visited (matched or not) before `list` stops walking a huge clone. */
export const DOCS_WALK_MAX_FILES = 20_000;

/** Length of `buf` without a trailing incomplete UTF-8 sequence (a clip must not break a character). */
function completeUtf8Length(buf: Uint8Array): number {
  const n = buf.length;
  for (let back = 1; back <= Math.min(3, n); back++) {
    const b = buf[n - back]!;
    if ((b & 0xc0) === 0x80) continue; // continuation byte: keep looking for the lead
    const need = b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : b >= 0xc0 ? 2 : 1;
    return need > back ? n - back : n;
  }
  return n;
}

export class FsDocsReader implements DocsReader {
  private walkMaxFiles: number;

  constructor(opts: { walkMaxFiles?: number } = {}) {
    this.walkMaxFiles = opts.walkMaxFiles ?? DOCS_WALK_MAX_FILES;
  }

  async list(root: string, match: (path: string) => boolean): Promise<DocEntry[]> {
    let realRoot: string;
    try {
      realRoot = await realpath(root);
    } catch {
      return [];
    }
    const out: DocEntry[] = [];
    let visited = 0;

    const walk = async (rel: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(join(realRoot, rel), { withFileTypes: true });
      } catch {
        return;
      }
      entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      for (const e of entries) {
        if (visited >= this.walkMaxFiles) return;
        if (EXCLUDED.has(e.name)) continue;
        const relPath = rel ? `${rel}/${e.name}` : e.name;
        // Symlinked directories are not followed (no loops, no escapes).
        if (e.isDirectory()) {
          await walk(relPath);
          continue;
        }
        if (!e.isFile() && !e.isSymbolicLink()) continue;
        visited++;
        if (!match(relPath)) continue;
        try {
          const real = await realpath(join(realRoot, relPath));
          if (!isInside(realRoot, real)) continue;
          const st = await stat(real);
          if (!st.isFile()) continue;
          out.push({ path: relPath, size: st.size });
        } catch {
          // dangling link or vanished file: not a document
        }
      }
    };

    await walk('');
    return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }

  async read(root: string, path: string, opts?: { maxBytes?: number; prefixBytes?: number }): Promise<DocRead> {
    if (hasUnsafeSegment(path)) return { ok: false, reason: 'invalid_path' };
    try {
      const realRoot = await realpath(root);
      const real = await realpath(join(realRoot, path));
      if (!isInside(realRoot, real)) return { ok: false, reason: 'invalid_path' };
      const st = await stat(real);
      if (!st.isFile()) return { ok: false, reason: 'not_found' };
      if (opts?.maxBytes !== undefined && st.size > opts.maxBytes) {
        return { ok: false, reason: 'too_large' };
      }
      const clip = opts?.prefixBytes !== undefined && st.size > opts.prefixBytes ? opts.prefixBytes : null;
      let buf: Uint8Array;
      if (clip === null) {
        buf = await readFile(real);
      } else {
        const fh = await open(real, 'r');
        try {
          const chunk = Buffer.alloc(clip);
          const { bytesRead } = await fh.read(chunk, 0, clip, 0);
          const got = chunk.subarray(0, bytesRead);
          buf = got.subarray(0, completeUtf8Length(got));
        } finally {
          await fh.close();
        }
      }
      try {
        const content = new TextDecoder('utf-8', { fatal: true }).decode(buf);
        return clip === null
          ? { ok: true, content, size: buf.byteLength }
          : { ok: true, content, size: st.size, truncated: true };
      } catch {
        return { ok: false, reason: 'not_utf8' };
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      return { ok: false, reason: code === 'ENOENT' || code === 'ENOTDIR' ? 'not_found' : 'unreadable' };
    }
  }
}
