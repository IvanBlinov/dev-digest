import { MAX_SAMPLE_CHARS, MAX_SAMPLE_LINES } from './constants.js';

/**
 * L03 req 39 — sample selection, pure code, no LLM. Decides WHICH files to
 * read (config discovery) and HOW they are shown to the model (truncated,
 * line-numbered). The service does the reading through the container ports.
 */

export type SampleKind = 'config' | 'sample';

export interface SampleFile {
  path: string;
  kind: SampleKind;
  /** What the model sees: `N| text` per kept line (+ a truncation marker). */
  numberedText: string;
  /** Number of kept (numbered) lines — the valid citation range is 1..lineCount. */
  lineCount: number;
  /** The kept raw lines — grounding cuts evidence snippets from these. */
  lines: string[];
  truncated: boolean;
}

/** Spec patterns: tsconfig*.json, .eslintrc*, eslint.config.*, .prettierrc*, prettier.config.*, .editorconfig, biome.json. */
const CONFIG_PATTERNS: readonly RegExp[] = [
  /^tsconfig(\.[\w-]+)*\.json$/,
  /^\.eslintrc(\.(js|cjs|mjs|json|ya?ml))?$/,
  /^eslint\.config\.(js|cjs|mjs|ts|mts|cts)$/,
  /^\.prettierrc(\.(js|cjs|mjs|json|json5|ya?ml|toml))?$/,
  /^prettier\.config\.(js|cjs|mjs|ts)$/,
  /^\.editorconfig$/,
  /^biome\.jsonc?$/,
];

/** Concrete names probed in each search dir (there is no directory-listing port). */
export const CONFIG_FILE_NAMES: readonly string[] = [
  'tsconfig.json',
  'tsconfig.base.json',
  'tsconfig.build.json',
  'tsconfig.app.json',
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  '.eslintrc.yml',
  '.eslintrc.yaml',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.js',
  '.prettierrc.cjs',
  '.prettierrc.yml',
  '.prettierrc.yaml',
  'prettier.config.js',
  'prettier.config.cjs',
  'prettier.config.mjs',
  '.editorconfig',
  'biome.json',
];

/** Marker that makes a sub-directory a config search dir ("package.json-adjacent"). */
export const PACKAGE_MANIFEST = 'package.json';

export function isConfigFileName(name: string): boolean {
  return CONFIG_PATTERNS.some((re) => re.test(name));
}

const joinPath = (dir: string, name: string): string => (dir ? `${dir}/${name}` : name);

/** Root ('') plus every distinct top-level directory seen in `paths`, sorted. */
export function configSearchDirs(paths: readonly string[]): string[] {
  const dirs = new Set<string>();
  for (const p of paths) {
    const slash = p.indexOf('/');
    if (slash > 0) dirs.add(p.slice(0, slash));
  }
  return ['', ...[...dirs].sort()];
}

export function configCandidatePaths(dir: string): string[] {
  return CONFIG_FILE_NAMES.map((name) => joinPath(dir, name));
}

/** Config files already present in a path list, at the root or one level deep. */
export function configPathsFromList(paths: readonly string[]): string[] {
  return paths.filter((p) => {
    const parts = p.split('/');
    return parts.length <= 2 && isConfigFileName(parts[parts.length - 1]!);
  });
}

/**
 * Truncate (≤ MAX_SAMPLE_LINES lines, ≤ MAX_SAMPLE_CHARS chars, cut at a line
 * boundary) and number the file. Null for an empty / whitespace-only file.
 */
export function prepareSample(path: string, kind: SampleKind, raw: string): SampleFile | null {
  if (raw.trim().length === 0) return null;
  const all = raw.replace(/\r\n?/g, '\n').split('\n');
  if (all[all.length - 1] === '') all.pop();

  const kept: string[] = [];
  let chars = 0;
  for (const line of all) {
    if (kept.length >= MAX_SAMPLE_LINES) break;
    const cost = line.length + (kept.length > 0 ? 1 : 0);
    if (chars + cost > MAX_SAMPLE_CHARS) break;
    kept.push(line);
    chars += cost;
  }
  // A single first line longer than the char cap: keep its head so the file isn't lost.
  if (kept.length === 0) kept.push(all[0]!.slice(0, MAX_SAMPLE_CHARS));

  const truncated = kept.length < all.length || kept[0] !== all[0];
  const numbered = kept.map((l, i) => `${i + 1}| ${l}`);
  if (truncated) numbered.push(`… (truncated after line ${kept.length})`);
  return { path, kind, numberedText: numbered.join('\n'), lineCount: kept.length, lines: kept, truncated };
}

/** Configs first, then samples; a path appears once (its first occurrence wins). */
export function mergeSamples(configs: readonly SampleFile[], samples: readonly SampleFile[]): SampleFile[] {
  const seen = new Set<string>();
  const out: SampleFile[] = [];
  for (const f of [...configs, ...samples]) {
    if (seen.has(f.path)) continue;
    seen.add(f.path);
    out.push(f);
  }
  return out;
}
