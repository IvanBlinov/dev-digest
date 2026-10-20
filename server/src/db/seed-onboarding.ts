import { eq } from 'drizzle-orm';
import type { OnboardingTour } from '@devdigest/shared';
import { ONBOARDING_PROMPT_VERSION } from '@devdigest/reviewer-core';
import type { Db } from './client.js';
import * as t from './schema.js';

/**
 * A ready onboarding tour for the seeded repo (acme/payments-api), so the studio shows a finished
 * tour without an LLM key. Paths come from the seeded PR #482 files. `index_sha` is null because the
 * seeded repo has no index state; the staleness check treats "no index state" as not stale.
 */
const PATHS = {
  ratelimit: 'src/middleware/ratelimit.ts',
  webhooks: 'src/api/public/webhooks.ts',
  publicIndex: 'src/api/public/index.ts',
  users: 'src/api/users.ts',
  config: 'src/config.ts',
} as const;

export const SEED_ONBOARDING_TOUR: OnboardingTour = {
  status: 'ready',
  index_sha: null,
  prompt_version: ONBOARDING_PROMPT_VERSION,
  generated_at: '2026-10-19T09:00:00.000Z',
  coverage: { files_indexed: 5, files_total: 5, partial: false },
  reasons: [],
  known_paths: Object.values(PATHS),
  generation: {
    provider: 'openrouter',
    model: 'openai/gpt-4.1-mini',
    llm_calls: 1,
    tokens_in: 1200,
    tokens_out: 480,
    cost_usd: 0.0007,
    duration_ms: 3200,
  },
  sections: {
    architecture: {
      source: 'llm',
      unavailable_reason: null,
      narrative:
        'payments-api is a small Node service: a public HTTP API under src/api, shared middleware under src/middleware and typed settings in src/config.ts. Public routes sit behind the rate limiter.',
      diagram: {
        nodes: [
          { id: 'module:api', label: 'api', kind: 'module' },
          { id: 'module:middleware', label: 'middleware', kind: 'module' },
          { id: 'module:config', label: 'config', kind: 'module' },
        ],
        edges: [
          { from: 'module:api', to: 'module:middleware' },
          { from: 'module:middleware', to: 'module:config' },
        ],
      },
    },
    critical_paths: {
      source: 'llm',
      unavailable_reason: null,
      items: [
        { path: PATHS.ratelimit, fact: 'imported by 2 files', reason: 'Guards every public route' },
        { path: PATHS.webhooks, fact: '2 endpoints · imported by 1 file', reason: 'Receives provider callbacks' },
      ],
    },
    run_commands: {
      source: 'llm',
      unavailable_reason: null,
      items: [
        { id: 'install', command: 'pnpm install', comment: 'Install dependencies', script_body: null },
        { id: 'script:dev', command: 'pnpm run dev', comment: 'Start the API locally', script_body: 'tsx watch src/index.ts' },
        { id: 'script:test', command: 'pnpm run test', comment: 'Run the unit tests', script_body: 'vitest run' },
      ],
    },
    reading_path: {
      source: 'llm',
      unavailable_reason: null,
      items: [
        { path: PATHS.config, why: 'Where settings and limits are defined', why_source: 'llm' },
        { path: PATHS.ratelimit, why: 'The middleware every public route shares', why_source: 'llm' },
        { path: PATHS.publicIndex, why: 'Wires the public routes together', why_source: 'llm' },
      ],
    },
    first_tasks: {
      source: 'llm',
      unavailable_reason: null,
      items: [
        {
          title: 'Document the rate limit headers',
          description: 'Describe the headers the limiter sets in docs/rate-limiting.md.',
          paths: [PATHS.ratelimit],
        },
        {
          title: 'Add a test for the users endpoint',
          description: 'Cover the validation error path of the users handler.',
          paths: [PATHS.users],
        },
      ],
    },
  },
};

/** Idempotent upsert of the seeded tour for a repo. Never touches a row that is generating. */
export async function seedOnboarding(db: Db, repoId: string): Promise<void> {
  const [existing] = await db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId)).limit(1);
  if (existing?.status === 'generating') return;
  const values = {
    json: SEED_ONBOARDING_TOUR,
    status: SEED_ONBOARDING_TOUR.status,
    lastError: null,
    startedAt: null,
    generatedAt: new Date(SEED_ONBOARDING_TOUR.generated_at),
    promptVersion: SEED_ONBOARDING_TOUR.prompt_version,
    indexSha: SEED_ONBOARDING_TOUR.index_sha,
  };
  await db
    .insert(t.onboarding)
    .values({ repoId, ...values })
    .onConflictDoUpdate({ target: t.onboarding.repoId, set: values });
}
