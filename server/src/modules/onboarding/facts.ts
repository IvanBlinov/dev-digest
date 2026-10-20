import type { GitClient, RepoRef } from '@devdigest/shared';
import {
  ONBOARDING_MAKE_ORDER,
  ONBOARDING_MAX_ENV_NAMES,
  ONBOARDING_MAX_TOP_DIRS,
  ONBOARDING_README_CHARS,
  ONBOARDING_SCRIPT_ORDER,
} from './constants.js';

/**
 * Facts read from the clone for the onboarding tour. Only an allowlist of files is ever read
 * (AC-23): root README*, package.json, <topdir>/package.json, root compose files, .env.example,
 * Makefile. `.env.example` yields variable NAMES only (AC-24). Nothing here holds a secret value.
 */
export type PackageManager = 'pnpm' | 'yarn' | 'npm';

export interface CloneFacts {
  readme: string | null;
  envNames: string[];
  hasEnvExample: boolean;
  packageManager: PackageManager;
  hasRootPackageJson: boolean;
  /** Root package.json scripts limited to dev, start, build, test (in that order). */
  scripts: { name: string; body: string }[];
  /** Dependency names from the root and one-level-deep package.json files (for the stack). */
  dependencies: string[];
  composeServices: string[];
  makeTargets: string[];
}

const README_RE = /^README[^/]*$/i;
const COMPOSE_RE = /^(docker-compose|compose)[^/]*\.ya?ml$/i;
const SAFE_DIR_RE = /^[A-Za-z0-9._-]+$/;
const ENV_NAME_RE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/;

/** A throwing readFile and an empty body both mean "missing". */
async function readOrNull(git: GitClient, ref: RepoRef, path: string): Promise<string | null> {
  try {
    const text = await git.readFile(ref, path);
    return text === '' ? null : text;
  } catch {
    return null;
  }
}

function parsePackageJson(text: string | null): { scripts: Record<string, unknown>; deps: string[] } | null {
  if (text === null) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const obj = parsed as Record<string, unknown>;
    const names = (v: unknown) => (typeof v === 'object' && v !== null ? Object.keys(v) : []);
    const scripts = typeof obj.scripts === 'object' && obj.scripts !== null ? (obj.scripts as Record<string, unknown>) : {};
    return { scripts, deps: [...names(obj.dependencies), ...names(obj.devDependencies)] };
  } catch {
    return null;
  }
}

function detectPackageManager(names: Set<string>): PackageManager {
  if (names.has('pnpm-lock.yaml')) return 'pnpm';
  if (names.has('yarn.lock')) return 'yarn';
  return 'npm';
}

export function parseEnvNames(text: string | null): string[] {
  if (text === null) return [];
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = ENV_NAME_RE.exec(line);
    if (m && !out.includes(m[1]!)) out.push(m[1]!);
    if (out.length >= ONBOARDING_MAX_ENV_NAMES) break;
  }
  return out;
}

/** Service names of a compose file, found by indentation under `services:` (no YAML parser). */
export function parseComposeServices(text: string | null): string[] {
  if (text === null) return [];
  const out: string[] = [];
  let inServices = false;
  let indent = -1;
  for (const raw of text.split(/\r?\n/)) {
    if (/^\s*(#.*)?$/.test(raw)) continue;
    const lead = raw.length - raw.trimStart().length;
    if (lead === 0) {
      inServices = /^services\s*:\s*(#.*)?$/.test(raw);
      indent = -1;
      continue;
    }
    if (!inServices) continue;
    if (indent === -1) indent = lead;
    if (lead !== indent) continue;
    const m = /^\s*["']?([A-Za-z0-9._-]+)["']?\s*:\s*(#.*)?$/.exec(raw);
    if (m) out.push(m[1]!);
  }
  return out;
}

export function parseMakeTargets(text: string | null): string[] {
  if (text === null) return [];
  const wanted = new Set<string>(ONBOARDING_MAKE_ORDER);
  const found = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Za-z0-9_-]+)\s*:(?!=)/.exec(line);
    if (m && wanted.has(m[1]!)) found.add(m[1]!);
  }
  return ONBOARDING_MAKE_ORDER.filter((t) => found.has(t));
}

export async function readCloneFacts(git: GitClient, ref: RepoRef, topLevelDirs: string[]): Promise<CloneFacts> {
  const rootNames = new Set(await git.listDir(ref, ''));
  const sorted = [...rootNames].sort();

  const readmeName = sorted.find((n) => README_RE.test(n));
  const readmeText = readmeName ? await readOrNull(git, ref, readmeName) : null;
  const readme = readmeText === null ? null : readmeText.slice(0, ONBOARDING_README_CHARS);

  const rootPkg = rootNames.has('package.json') ? parsePackageJson(await readOrNull(git, ref, 'package.json')) : null;
  const scripts = ONBOARDING_SCRIPT_ORDER.flatMap((name) => {
    const body = rootPkg?.scripts[name];
    return typeof body === 'string' ? [{ name, body }] : [];
  });

  const dependencies = new Set<string>(rootPkg?.deps ?? []);
  const dirs = topLevelDirs.filter((d) => SAFE_DIR_RE.test(d) && d !== '.' && d !== '..').slice(0, ONBOARDING_MAX_TOP_DIRS);
  for (const dir of dirs) {
    const pkg = parsePackageJson(await readOrNull(git, ref, `${dir}/package.json`));
    for (const d of pkg?.deps ?? []) dependencies.add(d);
  }

  const hasEnvExample = rootNames.has('.env.example');
  const envNames = hasEnvExample ? parseEnvNames(await readOrNull(git, ref, '.env.example')) : [];

  const composeName = sorted.find((n) => COMPOSE_RE.test(n));
  const composeServices = composeName ? parseComposeServices(await readOrNull(git, ref, composeName)) : [];

  const makeTargets = rootNames.has('Makefile') ? parseMakeTargets(await readOrNull(git, ref, 'Makefile')) : [];

  return {
    readme,
    envNames,
    hasEnvExample,
    packageManager: detectPackageManager(rootNames),
    hasRootPackageJson: rootPkg !== null || rootNames.has('package.json'),
    scripts,
    dependencies: [...dependencies],
    composeServices,
    makeTargets,
  };
}
