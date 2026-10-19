import { readdir, realpath, stat, readFile } from 'node:fs/promises';
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

export class FsDocsReader implements DocsReader {
  async list(root: string, match: (path: string) => boolean): Promise<DocEntry[]> {
    let realRoot: string;
    try {
      realRoot = await realpath(root);
    } catch {
      return [];
    }
    const out: DocEntry[] = [];

    const walk = async (rel: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(join(realRoot, rel), { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (EXCLUDED.has(e.name)) continue;
        const relPath = rel ? `${rel}/${e.name}` : e.name;
        // Symlinked directories are not followed (no loops, no escapes).
        if (e.isDirectory()) {
          await walk(relPath);
          continue;
        }
        if (!e.isFile() && !e.isSymbolicLink()) continue;
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

  async read(root: string, path: string, opts?: { maxBytes?: number }): Promise<DocRead> {
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
      const buf = await readFile(real);
      try {
        const content = new TextDecoder('utf-8', { fatal: true }).decode(buf);
        return { ok: true, content, size: buf.byteLength };
      } catch {
        return { ok: false, reason: 'not_utf8' };
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      return { ok: false, reason: code === 'ENOENT' || code === 'ENOTDIR' ? 'not_found' : 'unreadable' };
    }
  }
}
