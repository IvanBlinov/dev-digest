import { describe, it, expect } from 'vitest';
import { readCloneFacts } from '../src/modules/onboarding/facts.js';
import { deriveCommands } from '../src/modules/onboarding/helpers.js';
import { SpyGit, REF } from './helpers/onboarding-fixtures.js';

/**
 * L05b S7 (red phase) — the clone fact reader (AC-23, AC-24) and command derivation
 * (AC-32, AC-34). Hermetic: SpyGit records every readFile / listDir call.
 *
 * Pinned interface (see the test report, "Needs from implementer"):
 *   readCloneFacts(git, ref, topLevelDirs) -> Promise<facts>; facts.readme: string | null,
 *   facts.envNames: string[];  deriveCommands(facts) -> { id, command, comment, script_body }[]
 */

const TOP_DIRS = ['src', 'docs', 'api'];

const ROOT_NAMES = [
  '.env',
  '.env.local',
  'id_rsa',
  'cert.pem',
  'key.json',
  'README.md',
  '.env.example',
  'pnpm-lock.yaml',
  'docker-compose.yml',
  'Makefile',
  'package.json',
  'src',
  'docs',
];

const COMPOSE = ['services:', '  api:', '    image: node', '  db:', '    image: postgres', 'volumes:', '  data: {}', ''].join('\n');

function fixtureFiles(over: Record<string, string> = {}): Record<string, string> {
  return {
    '.env': 'DB_PASSWORD=hunter2-real-secret',
    '.env.local': 'TOKEN=local-real-secret',
    id_rsa: '-----BEGIN PRIVATE KEY----- id_rsa-body',
    'cert.pem': '-----BEGIN CERTIFICATE----- cert-body',
    'key.json': '{"private_key":"key-json-body"}',
    'README.md': '# Demo\nroot readme text',
    '.env.example': 'API_URL=http://localhost\nDB_URL=postgres://x\n',
    'pnpm-lock.yaml': 'lockfileVersion: LOCKFILE_BODY_MARKER',
    'docker-compose.yml': COMPOSE,
    Makefile: 'setup:\n\tpnpm i\n',
    'package.json': JSON.stringify({ name: 'demo', scripts: { dev: 'vite', test: 'vitest run' } }),
    'api/package.json': JSON.stringify({ name: 'api', scripts: { dev: 'tsx watch', start: 'node dist' } }),
    'docs/README.md': 'NESTED_README_MARKER',
    'src/index.ts': 'ARBITRARY_SOURCE_MARKER',
    ...over,
  };
}

function gitWith(files: Record<string, string>, root: string[] = ROOT_NAMES) {
  return new SpyGit({ files, root });
}

const ALLOWED: RegExp[] = [
  /^README[^/]*$/, // root README*
  /^package\.json$/, // root package.json
  /^[^/]+\/package\.json$/, // one level deep
  /^(docker-compose|compose)[^/]*\.ya?ml$/, // root compose files
  /^\.env\.example$/,
  /^Makefile$/,
];

describe('onboarding fact reader — allowlist (AC-23)', () => {
  it('AC-23: every readFile path is on the allowlist', async () => {
    const git = gitWith(fixtureFiles());
    await readCloneFacts(git, REF, TOP_DIRS);
    expect(git.readPaths.length).toBeGreaterThan(0);
    for (const p of git.readPaths) {
      expect(ALLOWED.some((re) => re.test(p)), `unexpected read: ${p}`).toBe(true);
    }
    expect(git.readPaths).toContain('README.md');
    expect(git.readPaths).toContain('package.json');
    expect(git.readPaths).toContain('.env.example');
    // listDir is only ever called for the repo root
    expect(git.listedDirs.length).toBeGreaterThan(0);
    expect(new Set(git.listedDirs)).toEqual(new Set(['']));
  });

  it('AC-23: never reads .env, .env.local, id_rsa, cert.pem, key.json or lockfile bodies (pnpm-lock.yaml)', async () => {
    const git = gitWith(fixtureFiles());
    const facts = await readCloneFacts(git, REF, TOP_DIRS);
    for (const banned of ['.env', '.env.local', 'id_rsa', 'cert.pem', 'key.json', 'pnpm-lock.yaml']) {
      expect(git.readPaths).not.toContain(banned);
    }
    const json = JSON.stringify(facts);
    for (const body of ['hunter2-real-secret', 'local-real-secret', 'cert-body', 'key-json-body', 'LOCKFILE_BODY_MARKER']) {
      expect(json).not.toContain(body);
    }
  });

  it('AC-23: never reads a nested docs/README.md or an arbitrary src/index.ts', async () => {
    const git = gitWith(fixtureFiles());
    const facts = await readCloneFacts(git, REF, TOP_DIRS);
    expect(git.readPaths).not.toContain('docs/README.md');
    expect(git.readPaths).not.toContain('src/index.ts');
    const json = JSON.stringify(facts);
    expect(json).not.toContain('NESTED_README_MARKER');
    expect(json).not.toContain('ARBITRARY_SOURCE_MARKER');
  });

  it('AC-23: README excerpt capped at 4000 chars', async () => {
    const git = gitWith(fixtureFiles({ 'README.md': 'R'.repeat(9000) }));
    const facts = await readCloneFacts(git, REF, TOP_DIRS);
    expect(facts.readme).not.toBeNull();
    expect(facts.readme!.length).toBe(4000);
  });

  it('AC-23: a readFile that throws is treated like a missing file', async () => {
    const git = new SpyGit({ files: fixtureFiles(), root: ROOT_NAMES, throwOn: ['README.md', '.env.example'] });
    const facts = await readCloneFacts(git, REF, TOP_DIRS);
    expect(facts.readme ?? '').toBe('');
    expect(facts.envNames).toEqual([]);
  });
});

describe('onboarding fact reader — .env.example names only (AC-24)', () => {
  it('AC-24: .env.example with 25 `NAME_i=secret` lines → 20 names; `secret` appears nowhere in the facts', async () => {
    const lines = Array.from({ length: 25 }, (_, i) => `NAME_${String(i).padStart(2, '0')}=topsecretvalue`).join('\n');
    const git = gitWith(fixtureFiles({ '.env.example': lines }));
    const facts = await readCloneFacts(git, REF, TOP_DIRS);
    expect(facts.envNames).toHaveLength(20);
    expect(facts.envNames[0]).toBe('NAME_00');
    expect(facts.envNames[19]).toBe('NAME_19');
    expect(JSON.stringify(facts)).not.toContain('secret');
  });
});

async function commandsFor(files: Record<string, string>, root: string[]) {
  const facts = await readCloneFacts(gitWith(files, root), REF, TOP_DIRS);
  return deriveCommands(facts);
}

describe('command derivation (AC-32, AC-34)', () => {
  it('AC-32: lockfile → package manager', async () => {
    const pkg = { 'package.json': JSON.stringify({ name: 'x', scripts: {} }) };
    const pnpm = await commandsFor(pkg, ['package.json', 'pnpm-lock.yaml']);
    expect(pnpm.find((c) => c.id === 'install')?.command).toBe('pnpm install');
    const yarn = await commandsFor(pkg, ['package.json', 'yarn.lock']);
    expect(yarn.find((c) => c.id === 'install')?.command).toBe('yarn install');
    const npmLock = await commandsFor(pkg, ['package.json', 'package-lock.json']);
    expect(npmLock.find((c) => c.id === 'install')?.command).toBe('npm install');
    const none = await commandsFor(pkg, ['package.json']);
    expect(none.find((c) => c.id === 'install')?.command).toBe('npm install');
  });

  it('AC-32: order and cap', async () => {
    const files = fixtureFiles({
      'package.json': JSON.stringify({
        name: 'demo',
        // declared in a different order than the spec order dev, start, build, test
        scripts: { test: 'vitest run', build: 'tsc', start: 'node .', dev: 'vite', lint: 'eslint .' },
      }),
      Makefile: 'test:\n\tvitest\nsetup:\n\tpnpm i\n',
    });
    const cmds = await commandsFor(files, ROOT_NAMES);
    // 5 + more candidates exist, capped at 6 and kept in order
    expect(cmds.map((c) => c.id)).toEqual(['install', 'env', 'compose', 'script:dev', 'script:start', 'script:build']);
    expect(cmds.map((c) => c.command)).toEqual([
      'pnpm install',
      'cp .env.example .env',
      'docker compose up -d api db',
      'pnpm run dev',
      'pnpm run start',
      'pnpm run build',
    ]);
    // the env comment is the variable names joined by ', ', at most 80 chars
    expect(cmds[1]!.comment).toBe('API_URL, DB_URL');
  });

  it('AC-32: env comment is at most 80 chars; scripts then make targets in spec order', async () => {
    const lines = Array.from({ length: 20 }, (_, i) => `LONG_VARIABLE_NAME_${i}=v`).join('\n');
    const withEnv = await commandsFor(
      fixtureFiles({ '.env.example': lines, 'docker-compose.yml': '' }),
      ['package.json', '.env.example', 'pnpm-lock.yaml'],
    );
    const env = withEnv.find((c) => c.id === 'env');
    expect(env?.comment?.length).toBeLessThanOrEqual(80);
    expect(env?.comment?.startsWith('LONG_VARIABLE_NAME_0, LONG_VARIABLE_NAME_1')).toBe(true);

    const files = {
      'package.json': JSON.stringify({ name: 'x', scripts: {} }),
      Makefile: '.PHONY: test setup\ntest:\n\tvitest\nsetup:\n\tpnpm i\nclean:\n\trm -rf dist\n',
    };
    const cmds = await commandsFor(files, ['package.json', 'Makefile']);
    expect(cmds.map((c) => c.id)).toEqual(['install', 'make:setup', 'make:test']);
    expect(cmds.map((c) => c.command)).toEqual(['npm install', 'make setup', 'make test']);
  });

  it('AC-32: scripts of api/package.json produce no commands', async () => {
    const files = {
      'package.json': JSON.stringify({ name: 'root', scripts: { test: 'vitest run' } }),
      'api/package.json': JSON.stringify({ name: 'api', scripts: { dev: 'tsx watch', start: 'node dist', build: 'tsc' } }),
    };
    const cmds = await commandsFor(files, ['package.json', 'api']);
    expect(cmds.map((c) => c.id)).toEqual(['install', 'script:test']);
  });

  it('AC-34: no package.json, compose file or Makefile → empty command list', async () => {
    const cmds = await commandsFor({ 'README.md': '# only a readme' }, ['README.md', 'src']);
    expect(cmds).toEqual([]);
  });

  it('script_body is truncated to 200 chars', async () => {
    const files = { 'package.json': JSON.stringify({ name: 'x', scripts: { dev: 'x'.repeat(300), test: 'vitest' } }) };
    const cmds = await commandsFor(files, ['package.json']);
    const dev = cmds.find((c) => c.id === 'script:dev')!;
    expect(dev.script_body!.length).toBeLessThanOrEqual(200);
    expect(dev.script_body!.length).toBeGreaterThan(150);
    // the copied command never contains the script body
    expect(dev.command).toBe('npm run dev');
    expect(cmds.find((c) => c.id === 'script:test')!.script_body).toBe('vitest');
  });
});
