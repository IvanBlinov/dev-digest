import 'dotenv/config';
import { z } from 'zod';
import { homedir } from 'node:os';
import { join, isAbsolute, resolve } from 'node:path';

/**
 * Central, zod-validated environment config. Loaded once at startup.
 *
 * NOTE: secret keys (OPENAI/ANTHROPIC/OPENROUTER/GITHUB_TOKEN) are deliberately
 * NOT in this schema. Feature code must access secrets through SecretsProvider,
 * never via process.env or AppConfig — the SecretsProvider is the one chokepoint
 * that reads process.env directly (see adapters/secrets/local.ts). Listing them
 * here would be dead config that never reaches AppConfig.
 */
const EnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .default('postgres://devdigest:devdigest@localhost:5432/devdigest'),
  // Memory/RAG embeddings run on OpenAI (text-embedding-3-small, 1536-dim — the
  // pgvector columns are locked to that). Default OFF so the app makes ZERO
  // OpenAI requests; set EMBEDDINGS_ENABLED=true to turn memory retrieval on.
  EMBEDDINGS_ENABLED: z.string().optional(),
  // repo-intel facade (Tier 1). Default ON — reviews get repo skeleton +
  // callers context. Set REPO_INTEL_ENABLED=false to opt out, in which case
  // every consumer degrades to ripgrep-identical behavior (acceptance #10).
  // Note: even when on, sections only populate once the repo is indexed; an
  // unindexed repo degrades gracefully. Per-agent override: agents.repo_intel.
  REPO_INTEL_ENABLED: z.string().optional(),
  API_PORT: z.coerce.number().int().default(3001),
  // How many agents of one review run at the same time (1 = one after another).
  REVIEW_AGENT_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(4),
  // Project context (L05): comma-separated root globs (commas inside {braces} are kept)
  // that decide which repo documents can be listed and attached to agents/skills.
  PROJECT_CONTEXT_ROOTS: z.string().optional(),
  WEB_PORT: z.coerce.number().int().default(3000),
  DEVDIGEST_CLONE_DIR: z.string().optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Verbose prompt-assembly logging (adds section digests + constant previews to
  // the `prompt.assembled` event). Only the literal '1' enables it, and it is
  // ignored in production. Never section contents either way.
  PROMPT_LOG_VERBOSE: z.string().optional(),
  // `.env` (and .env.example) ship `LOG_LEVEL=` empty; an empty string is not a
  // valid enum member, so coerce '' → undefined to fall through to the default.
  LOG_LEVEL: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
  ),
});

/** Default root globs for project-context documents (AC-1). */
export const DEFAULT_PROJECT_CONTEXT_ROOTS = ['**/{specs,docs,insights}/**/*.md', '**/INSIGHTS.md'];

/** Split on commas that are not inside `{…}`; trims entries and drops empty ones. */
function splitRoots(raw: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of raw) {
    if (ch === '{') depth++;
    else if (ch === '}') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((r) => r.trim()).filter(Boolean);
}

export type AppConfig = {
  databaseUrl: string;
  apiPort: number;
  /** Max agents of one review running in parallel. */
  reviewAgentConcurrency: number;
  webPort: number;
  /** Absolute path where repos are cloned (~/.devdigest/workspace by default). */
  cloneDir: string;
  /** Absolute path to the writable secrets store (BYO keys from the UI). */
  secretsPath: string;
  nodeEnv: 'development' | 'test' | 'production';
  logLevel: string;
  /** Allowed CORS origin for the Next.js dev server. */
  webOrigin: string;
  /** Whether memory/RAG embeddings (OpenAI) are enabled. Default false. */
  embeddingsEnabled: boolean;
  /**
   * Whether the repo-intel facade (Tier 1: phantom-gate, callers-in-prompt) is
   * active. Default ON — set REPO_INTEL_ENABLED=false to opt out, in which case
   * every facade method returns its degraded result (`[]`) so consumers behave
   * EXACTLY like the ripgrep-only baseline.
   */
  repoIntelEnabled: boolean;
  /** Root globs of the repo documents that may be attached as project context (L05). */
  projectContextRoots: string[];
  /** Verbose `prompt.assembled` detail (digests, constant previews). Never true in production. */
  promptLogVerbose: boolean;
  /** PROMPT_LOG_VERBOSE=1 was set in production and ignored (boot warns once). */
  promptLogVerboseIgnored: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.parse(env);
  const cloneDirRaw =
    parsed.DEVDIGEST_CLONE_DIR ?? join(homedir(), '.devdigest', 'workspace');
  const cloneDir = isAbsolute(cloneDirRaw) ? cloneDirRaw : resolve(process.cwd(), cloneDirRaw);
  const verboseRequested = parsed.PROMPT_LOG_VERBOSE === '1';
  const isProd = parsed.NODE_ENV === 'production';
  return {
    databaseUrl: parsed.DATABASE_URL,
    apiPort: parsed.API_PORT,
    reviewAgentConcurrency: parsed.REVIEW_AGENT_CONCURRENCY,
    webPort: parsed.WEB_PORT,
    cloneDir,
    secretsPath: join(homedir(), '.devdigest', 'secrets.json'),
    nodeEnv: parsed.NODE_ENV,
    logLevel: parsed.LOG_LEVEL ?? (parsed.NODE_ENV === 'test' ? 'silent' : 'info'),
    webOrigin: `http://localhost:${parsed.WEB_PORT}`,
    embeddingsEnabled: parsed.EMBEDDINGS_ENABLED === 'true',
    repoIntelEnabled: parsed.REPO_INTEL_ENABLED !== 'false',
    projectContextRoots: (() => {
      const roots = splitRoots(parsed.PROJECT_CONTEXT_ROOTS ?? '');
      return roots.length > 0 ? roots : [...DEFAULT_PROJECT_CONTEXT_ROOTS];
    })(),
    promptLogVerbose: verboseRequested && !isProd,
    promptLogVerboseIgnored: verboseRequested && isProd,
  };
}
