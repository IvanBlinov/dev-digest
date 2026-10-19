/**
 * L05 — FsDocsReader against a temp-dir clone. No DB, no git.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { FsDocsReader } from '../src/adapters/docs/index.js';

async function put(root: string, rel: string, data: string | Uint8Array): Promise<void> {
  const full = join(root, rel);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, data);
}

const mdOnly = (p: string) => p.endsWith('.md');

describe('FsDocsReader', () => {
  let root: string;
  let outside: string;
  const reader = new FsDocsReader();

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'docs-reader-'));
    outside = await mkdtemp(join(tmpdir(), 'docs-outside-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  it('lists only paths accepted by match, sorted, with byte sizes', async () => {
    await put(root, 'docs/b.md', 'bbbb');
    await put(root, 'docs/a.md', 'aé');
    await put(root, 'docs/c.txt', 'nope');
    expect(await reader.list(root, mdOnly)).toEqual([
      { path: 'docs/a.md', size: 3 },
      { path: 'docs/b.md', size: 4 },
    ]);
  });

  it('AC-62: nothing under .git/ or node_modules/ is listed or readable', async () => {
    await put(root, 'docs/a.md', 'a');
    await put(root, '.git/docs/x.md', 'x');
    await put(root, 'node_modules/p/docs/y.md', 'y');
    await put(root, 'pkg/node_modules/docs/z.md', 'z');
    expect((await reader.list(root, mdOnly)).map((e) => e.path)).toEqual(['docs/a.md']);
    expect(await reader.read(root, 'node_modules/p/docs/y.md')).toEqual({
      ok: false,
      reason: 'invalid_path',
    });
    expect(await reader.read(root, '.git/docs/x.md')).toEqual({ ok: false, reason: 'invalid_path' });
  });

  it('AC-63: a symlink to a file outside the root is not listed and not readable', async () => {
    await put(outside, 'secret.md', 'secret');
    await mkdir(join(root, 'docs'), { recursive: true });
    await symlink(join(outside, 'secret.md'), join(root, 'docs/link.md'));
    await put(root, 'docs/ok.md', 'ok');
    expect((await reader.list(root, mdOnly)).map((e) => e.path)).toEqual(['docs/ok.md']);
    expect(await reader.read(root, 'docs/link.md')).toEqual({ ok: false, reason: 'invalid_path' });
  });

  it('AC-63: a symlinked directory is not followed', async () => {
    await put(outside, 'docs/x.md', 'x');
    await symlink(outside, join(root, 'linked'));
    expect(await reader.list(root, mdOnly)).toEqual([]);
  });

  it('AC-7: invalid UTF-8 bytes give not_utf8', async () => {
    await put(root, 'docs/bad.md', new Uint8Array([0x68, 0xff, 0xfe, 0x69]));
    expect(await reader.read(root, 'docs/bad.md')).toEqual({ ok: false, reason: 'not_utf8' });
  });

  it('reads valid content with its byte size', async () => {
    await put(root, 'docs/a.md', 'héllo');
    expect(await reader.read(root, 'docs/a.md')).toEqual({ ok: true, content: 'héllo', size: 6 });
  });

  it('a missing file gives not_found', async () => {
    expect(await reader.read(root, 'docs/none.md')).toEqual({ ok: false, reason: 'not_found' });
  });

  it('maxBytes exceeded gives too_large', async () => {
    await put(root, 'docs/big.md', 'x'.repeat(11));
    expect(await reader.read(root, 'docs/big.md', { maxBytes: 10 })).toEqual({
      ok: false,
      reason: 'too_large',
    });
    expect((await reader.read(root, 'docs/big.md', { maxBytes: 11 })).ok).toBe(true);
  });

  it('rejects .. and absolute paths', async () => {
    expect(await reader.read(root, '../x.md')).toEqual({ ok: false, reason: 'invalid_path' });
    expect(await reader.read(root, '/etc/passwd')).toEqual({ ok: false, reason: 'invalid_path' });
  });

  it('a missing root lists nothing', async () => {
    expect(await reader.list(join(root, 'nope'), mdOnly)).toEqual([]);
  });
});
