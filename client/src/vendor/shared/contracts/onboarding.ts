import { z } from 'zod';

/**
 * L05b Onboarding tour contracts: the stored tour, the GET state and the POST response.
 * Wire format is snake_case. `OnboardingNarrative` is the LLM-output schema and has no
 * `.max()` caps on purpose: over-long text is truncated by the server, not rejected.
 */
export const OnboardingReason = z.enum([
  'no_api_key',
  'llm_error',
  'llm_timeout',
  'invalid_output',
  'interrupted',
  'index_degraded',
  'index_partial',
  'budget_trimmed',
  'no_graph',
]);
export type OnboardingReason = z.infer<typeof OnboardingReason>;

const SectionSource = z.enum(['llm', 'deterministic']);
const SectionBase = {
  source: SectionSource,
  unavailable_reason: OnboardingReason.nullable(),
};

export const OnboardingDiagram = z.object({
  nodes: z.array(z.object({ id: z.string(), label: z.string(), kind: z.enum(['module', 'service']) })),
  edges: z.array(z.object({ from: z.string(), to: z.string() })),
});
export type OnboardingDiagram = z.infer<typeof OnboardingDiagram>;

export const OnboardingTour = z.object({
  status: z.enum(['ready', 'partial', 'skeleton']),
  index_sha: z.string().nullable(),
  prompt_version: z.string(),
  generated_at: z.string(),
  coverage: z.object({
    files_indexed: z.number().int(),
    files_total: z.number().int().nullable(),
    partial: z.boolean(),
  }),
  reasons: z.array(OnboardingReason),
  known_paths: z.array(z.string()),
  generation: z.object({
    provider: z.string(),
    model: z.string(),
    llm_calls: z.number().int(),
    tokens_in: z.number().int(),
    tokens_out: z.number().int(),
    cost_usd: z.number().nullable(),
    duration_ms: z.number(),
  }),
  sections: z.object({
    architecture: z.object({
      ...SectionBase,
      narrative: z.string(),
      diagram: OnboardingDiagram.nullable(),
    }),
    critical_paths: z.object({
      ...SectionBase,
      items: z.array(z.object({ path: z.string(), fact: z.string(), reason: z.string().nullable() })),
    }),
    run_commands: z.object({
      ...SectionBase,
      items: z.array(
        z.object({
          id: z.string(),
          command: z.string(),
          comment: z.string().nullable(),
          script_body: z.string().nullable(),
        }),
      ),
    }),
    reading_path: z.object({
      ...SectionBase,
      items: z.array(z.object({ path: z.string(), why: z.string(), why_source: SectionSource })),
    }),
    first_tasks: z.object({
      ...SectionBase,
      items: z.array(z.object({ title: z.string(), description: z.string(), paths: z.array(z.string()) })),
    }),
  }),
});
export type OnboardingTour = z.infer<typeof OnboardingTour>;

export const OnboardingTourState = z.object({
  status: z.enum(['none', 'generating', 'ready', 'partial', 'skeleton', 'failed']),
  cloned: z.boolean(),
  tour: OnboardingTour.nullable(),
  stale: z.boolean(),
  stale_reason: z.enum(['index_moved', 'prompt_changed']).nullable(),
  index_updated_at: z.string().nullable(),
  last_error: z.object({ reason: OnboardingReason, at: z.string() }).nullable(),
});
export type OnboardingTourState = z.infer<typeof OnboardingTourState>;

export const OnboardingGenerateResponse = z.object({ status: z.literal('generating') });
export type OnboardingGenerateResponse = z.infer<typeof OnboardingGenerateResponse>;

/** LLM output for the narrative call. No length caps: the server truncates (AC-43). */
export const OnboardingNarrative = z.object({
  architecture: z.string(),
  critical_path_reasons: z.array(z.object({ path: z.string(), reason: z.string() })),
  commands: z.array(z.object({ id: z.string(), comment: z.string() })),
  reading_path: z.array(z.object({ path: z.string(), why: z.string() })),
  first_tasks: z.array(z.object({ title: z.string(), description: z.string(), paths: z.array(z.string()) })),
});
export type OnboardingNarrative = z.infer<typeof OnboardingNarrative>;
