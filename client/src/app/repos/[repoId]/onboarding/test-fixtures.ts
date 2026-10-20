/* Test fixtures for the onboarding tour screen. Content mirrors server/src/db/seed-onboarding.ts. */
import type { OnboardingTour, OnboardingTourState, Repo } from "@devdigest/shared";

export const REPO: Repo = {
  id: "r1",
  workspace_id: "w1",
  owner: "acme",
  name: "payments-api",
  full_name: "acme/payments-api",
  default_branch: "main",
  clone_path: null,
  last_polled_at: null,
  created_by: null,
};

export const PATHS = {
  ratelimit: "src/middleware/ratelimit.ts",
  webhooks: "src/api/public/webhooks.ts",
  publicIndex: "src/api/public/index.ts",
  users: "src/api/users.ts",
  config: "src/config.ts",
} as const;

/** Fixed clock for relative-time assertions: 2 hours after the tour was generated. */
export const NOW = new Date("2026-10-19T11:00:00.000Z");

export function tour(over: Partial<OnboardingTour> = {}): OnboardingTour {
  return {
    status: "ready",
    index_sha: null,
    prompt_version: "v1",
    generated_at: "2026-10-19T09:00:00.000Z",
    coverage: { files_indexed: 5, files_total: 5, partial: false },
    reasons: [],
    known_paths: Object.values(PATHS),
    generation: {
      provider: "openrouter",
      model: "openai/gpt-4.1-mini",
      llm_calls: 1,
      tokens_in: 1200,
      tokens_out: 480,
      cost_usd: 0.0007,
      duration_ms: 3200,
    },
    sections: {
      architecture: {
        source: "llm",
        unavailable_reason: null,
        narrative:
          "payments-api is a small Node service: a public HTTP API under src/api, shared middleware under src/middleware and typed settings in src/config.ts. Public routes sit behind the rate limiter.",
        diagram: {
          nodes: [
            { id: "module:api", label: "api", kind: "module" },
            { id: "module:middleware", label: "middleware", kind: "module" },
            { id: "module:config", label: "config", kind: "module" },
          ],
          edges: [
            { from: "module:api", to: "module:middleware" },
            { from: "module:middleware", to: "module:config" },
          ],
        },
      },
      critical_paths: {
        source: "llm",
        unavailable_reason: null,
        items: [
          { path: PATHS.ratelimit, fact: "imported by 2 files", reason: "Guards every public route" },
          { path: PATHS.webhooks, fact: "2 endpoints · imported by 1 file", reason: "Receives provider callbacks" },
        ],
      },
      run_commands: {
        source: "llm",
        unavailable_reason: null,
        items: [
          { id: "install", command: "pnpm install", comment: "Install dependencies", script_body: null },
          { id: "script:dev", command: "pnpm run dev", comment: "Start the API locally", script_body: "tsx watch src/index.ts" },
          { id: "script:test", command: "pnpm run test", comment: "Run the unit tests", script_body: "vitest run" },
        ],
      },
      reading_path: {
        source: "llm",
        unavailable_reason: null,
        items: [
          { path: PATHS.config, why: "Where settings and limits are defined", why_source: "llm" },
          { path: PATHS.ratelimit, why: "The middleware every public route shares", why_source: "llm" },
          { path: PATHS.publicIndex, why: "Wires the public routes together", why_source: "llm" },
        ],
      },
      first_tasks: {
        source: "llm",
        unavailable_reason: null,
        items: [
          {
            title: "Document the rate limit headers",
            description: "Describe the headers the limiter sets in docs/rate-limiting.md.",
            paths: [PATHS.ratelimit],
          },
          {
            title: "Add a test for the users endpoint",
            description: "Cover the validation error path of the users handler.",
            paths: [PATHS.users],
          },
        ],
      },
    },
    ...over,
  };
}

/** A ready, cloned, fresh state. Override `cloned: false` for the AC-51 view. */
export function tourState(over: Partial<OnboardingTourState> = {}): OnboardingTourState {
  return {
    status: "ready",
    cloned: true,
    tour: tour(),
    stale: false,
    stale_reason: null,
    index_updated_at: "2026-10-19T10:00:00.000Z",
    last_error: null,
    ...over,
  };
}
