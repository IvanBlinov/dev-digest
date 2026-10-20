import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SimpleGitClient } from '../src/adapters/git/simple-git.js';
import { MockGitClient } from '../src/adapters/mocks.js';

const REPO = { owner: 'acme', name: 'demo' };

describe('GitClient.listDir', () => {
  let base: string;
  let git: SimpleGitClient;

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), 'list-dir-'));
    git = new SimpleGitClient(base);
    const root = git.clonePathFor(REPO);
    await mkdir(join(root, 'src', 'deep'), { recursive: true });
    await writeFile(join(root, 'package.json'), '{}');
    await writeFile(join(root, 'README.md'), '#');
    await writeFile(join(root, 'src', 'a.ts'), '');
    await writeFile(join(root, 'src', 'deep', 'b.ts'), '');
  });
  afterAll(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it('AC-23: listDir returns entry names of one directory, sorted, non-recursive', async () => {
    expect(await git.listDir(REPO, '')).toEqual(['README.md', 'package.json', 'src']);
    expect(await git.listDir(REPO, 'src')).toEqual(['a.ts', 'deep']);
  });

  it('AC-23: listDir of a missing dir returns []', async () => {
    expect(await git.listDir(REPO, 'nope')).toEqual([]);
  });

  it("AC-23: listDir rejects a dir containing '..' or an absolute path", async () => {
    await expect(git.listDir(REPO, '../x')).rejects.toThrow();
    await expect(git.listDir(REPO, 'src/../../x')).rejects.toThrow();
    await expect(git.listDir(REPO, '/etc')).rejects.toThrow();
  });

  it('MockGitClient.listDir derives names from opts.files keys', async () => {
    const mock = new MockGitClient({ files: { 'README.md': 'x', 'src/a.ts': '', 'src/deep/b.ts': '', 'docs/x.md': '' } });
    expect(await mock.listDir(REPO, '')).toEqual(['README.md', 'docs', 'src']);
    expect(await mock.listDir(REPO, 'src')).toEqual(['a.ts', 'deep']);
    expect(await mock.listDir(REPO, 'zzz')).toEqual([]);
  });
});
