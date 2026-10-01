/** Constants for the conventions module (L03). */

/** Top-ranked files sampled via `repoIntel.getConventionSamples` (req 39). */
export const SAMPLE_FILE_COUNT = 12;

/** Ranked paths read to find the one-level-deep directories that may hold configs. */
export const RANKED_PATHS_FOR_DIRS = 2_000;

/** Max config files sent to the model (configs come before samples). */
export const MAX_CONFIG_FILES = 12;

/** Per-file truncation of what the model sees (and what grounding checks against). */
export const MAX_SAMPLE_LINES = 300;
export const MAX_SAMPLE_CHARS = 12_000;

/** Evidence snippets are cut from the real file lines, at most this many. */
export const MAX_SNIPPET_LINES = 15;

/** Cap on candidates kept from one scan (the prompt asks for 5–15). */
export const MAX_CANDIDATES_PER_SCAN = 15;

/**
 * The extraction call. L02 runs showed provider calls can hang, so the call is
 * bounded; one reprompt on a schema error is enough for structured output.
 */
export const EXTRACT_TIMEOUT_MS = 120_000;
export const EXTRACT_MAX_RETRIES = 1;
export const EXTRACT_TEMPERATURE = 0.2;
/**
 * Generous on purpose: if a reasoning model is picked in Settings (e.g. deepseek-v4-flash) it spends
 * completion tokens on hidden reasoning first — 4 000 measured as ALL reasoning,
 * empty content (2026-09-30). The answer itself is ~1 000 tokens.
 */
export const EXTRACT_MAX_TOKENS = 8_000;
/** Safety net around the whole background job (sampling + LLM + persist). */
export const SCAN_JOB_TIMEOUT_MS = 5 * 60_000;

/** A `running` scan older than this is treated as orphaned (process died) and failed. */
export const STALE_SCAN_MS = 10 * 60_000;
export const STALE_SCAN_ERROR = 'Scan did not finish (timed out or the server restarted)';

export const scanTimeoutMessage = (provider: string, model: string): string =>
  `${provider}/${model} did not answer within ${Math.round(SCAN_JOB_TIMEOUT_MS / 60_000)} minutes. ` +
  'Reasoning models can be very slow here — pick a faster model in Settings → Models → Conventions.';

/** Stored scan error messages are truncated to this length. */
export const MAX_SCAN_ERROR_CHARS = 500;

/** LLM-calling route — tighter than the global limit. */
export const EXTRACT_RATE_LIMIT = { max: 10, timeWindow: '1 minute' };

/** Skill draft (req 41/42). */
export const DEFAULT_SKILL_NAME = 'repo-conventions';
export const MAX_RULE_SLUG_CHARS = 48;
export const FALLBACK_RULE_SLUG = 'convention';
/** When the full draft is longer than SKILL_BODY_MAX, snippets are cut to this many lines. */
export const COMPACT_SNIPPET_LINES = 5;

export const skillVersionMessage = (n: number): string =>
  `Created from ${n} convention${n === 1 ? '' : 's'}`;

/** File extension → fenced-code language for the draft body. */
export const LANGUAGE_BY_EXTENSION: Readonly<Record<string, string>> = {
  ts: 'ts',
  mts: 'ts',
  cts: 'ts',
  tsx: 'tsx',
  js: 'js',
  mjs: 'js',
  cjs: 'js',
  jsx: 'jsx',
  json: 'json',
  jsonc: 'json',
  md: 'md',
  py: 'python',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  rb: 'ruby',
  css: 'css',
  scss: 'scss',
  html: 'html',
  sql: 'sql',
  sh: 'bash',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'toml',
};

/** Dot-files without an extension that still have a natural language. */
export const LANGUAGE_BY_FILENAME: Readonly<Record<string, string>> = {
  '.editorconfig': 'ini',
  '.eslintrc': 'json',
  '.prettierrc': 'json',
};
