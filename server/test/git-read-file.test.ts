import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SimpleGitClient, READ_FILE_MAX_BYTES } from '../src/adapters/git/simple-git.js';

const REPO = { owner: 'acme', name: 'demo' };

describe('GitClient.readFile containment and bound', () => {
  let base: string;
  let outside: string;
  let git: SimpleGitClient;

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), 'read-file-'));
    outside = await mkdtemp(join(tmpdir(), 'read-file-outside-'));
    git = new SimpleGitClient(base);
    const root = git.clonePathFor(REPO);
    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(join(root, 'README.md'), 'hello');
    await writeFile(join(root, 'src', 'a.ts'), 'export {}');
    await writeFile(join(outside, 'secret.txt'), 'TOP-SECRET');
    await symlink(join(outside, 'secret.txt'), join(root, 'leak.md'));
    await symlink(outside, join(root, 'linkdir'));
    await symlink(join(root, 'src', 'a.ts'), join(root, 'inside.ts'));
    await writeFile(join(root, 'big.txt'), 'x'.repeat(READ_FILE_MAX_BYTES + 5000));
  });
  afterAll(async () => {
    await rm(base, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  it('reads a regular file', async () => {
    expect(await git.readFile(REPO, 'README.md')).toBe('hello');
  });

  it('rejects a symlink pointing outside the clone', async () => {
    await expect(git.readFile(REPO, 'leak.md')).rejects.toThrow();
    await expect(git.readFile(REPO, 'linkdir/secret.txt')).rejects.toThrow();
  });

  it('allows a symlink that stays inside the clone', async () => {
    expect(await git.readFile(REPO, 'inside.ts')).toBe('export {}');
  });

  it("rejects '..' segments and absolute paths", async () => {
    await expect(git.readFile(REPO, '../x')).rejects.toThrow();
    await expect(git.readFile(REPO, 'src/../../x')).rejects.toThrow();
    await expect(git.readFile(REPO, join(outside, 'secret.txt'))).rejects.toThrow();
  });

  it('rejects a directory', async () => {
    await expect(git.readFile(REPO, 'src')).rejects.toThrow();
  });

  it('F-2: returns only the first READ_FILE_MAX_BYTES of a larger file', async () => {
    const out = await git.readFile(REPO, 'big.txt');
    expect(out.length).toBe(READ_FILE_MAX_BYTES);
  });
});
