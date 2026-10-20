import { z } from 'zod';

/**
 * PR Brief building blocks: Intent, Blast radius, Risks, PR History,
 * Smart Diff. Composed into PrBrief.
 */

// ---- Intent ----
export const IntentConfidence = z.enum(['low', 'medium', 'high']);
export type IntentConfidence = z.infer<typeof IntentConfidence>;

export const IntentSourceKind = z.enum([
  'pr_title',
  'pr_body',
  'branch',
  'commits',
  'files',
  'issue',
  'spec',
  'plan',
  'link',
]);
export type IntentSourceKind = z.infer<typeof IntentSourceKind>;

export const IntentSourceStatus = z.enum([
  'ok',
  'not_found',
  'forbidden',
  'timeout',
  'not_allowlisted',
  'too_large',
  'unsupported',
  'unavailable',
]);
export type IntentSourceStatus = z.infer<typeof IntentSourceStatus>;

/** One input the classifier looked at (or tried to). `ref` is sanitised: no query string, fragment or userinfo. */
export const IntentSource = z.object({
  kind: IntentSourceKind,
  ref: z.string(),
  status: IntentSourceStatus,
  truncated: z.boolean().nullish(),
});
export type IntentSource = z.infer<typeof IntentSource>;

export const Intent = z.object({
  summary: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
  confidence: IntentConfidence,
  sources: z.array(IntentSource),
  missing_context: z.array(z.string()),
});
export type Intent = z.infer<typeof Intent>;

/** LLM output of the intent classifier (strict json_schema: all required, no length constraints). */
export const IntentClassification = z.object({
  summary: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
  confidence: IntentConfidence,
  missing_context: z.array(z.string()),
});
export type IntentClassification = z.infer<typeof IntentClassification>;

// ---- Blast radius ----
export const ChangedSymbol = z.object({
  name: z.string(),
  file: z.string(),
  kind: z.string(),
});
export type ChangedSymbol = z.infer<typeof ChangedSymbol>;

export const BlastCaller = z.object({
  name: z.string(),
  file: z.string(),
  line: z.number().int(),
});
export type BlastCaller = z.infer<typeof BlastCaller>;

export const DownstreamImpact = z.object({
  symbol: z.string(),
  callers: z.array(BlastCaller),
  endpoints_affected: z.array(z.string()),
  crons_affected: z.array(z.string()),
});
export type DownstreamImpact = z.infer<typeof DownstreamImpact>;

export const BlastDegradedReason = z.enum([
  'flag_off',
  'index_failed',
  'index_partial',
  'repo_too_large',
  'no_data',
]);
export type BlastDegradedReason = z.infer<typeof BlastDegradedReason>;

export const BlastRadius = z.object({
  changed_symbols: z.array(ChangedSymbol),
  downstream: z.array(DownstreamImpact),
  summary: z.string(),
  degraded: z.boolean().optional(),
  reason: BlastDegradedReason.optional(),
});
export type BlastRadius = z.infer<typeof BlastRadius>;

// ---- Risks ----
export const RiskSeverity = z.enum(['high', 'medium', 'low']);
export type RiskSeverity = z.infer<typeof RiskSeverity>;

export const RiskRef = z.object({
  file: z.string(),
  start_line: z.number().int().nullable(),
  end_line: z.number().int().nullable(),
});
export type RiskRef = z.infer<typeof RiskRef>;

export const Risk = z.object({
  kind: z.string(),
  title: z.string(),
  explanation: z.string(),
  severity: RiskSeverity,
  refs: z.array(RiskRef).min(1),
});
export type Risk = z.infer<typeof Risk>;

export const Risks = z.object({
  risks: z.array(Risk),
});
export type Risks = z.infer<typeof Risks>;

// ---- PR History ----
export const PrHistoryItem = z.object({
  pr_number: z.number().int(),
  title: z.string(),
  merged_at: z.string(),
  author: z.string(),
  files_overlap: z.array(z.string()),
  notes: z.string(),
});
export type PrHistoryItem = z.infer<typeof PrHistoryItem>;

export const PrHistory = z.object({
  history: z.array(PrHistoryItem),
});
export type PrHistory = z.infer<typeof PrHistory>;

// ---- Smart Diff ----
export const SmartDiffRole = z.enum(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
export type SmartDiffRole = z.infer<typeof SmartDiffRole>;

export const SmartDiffFile = z.object({
  path: z.string(),
  pseudocode_summary: z.string().nullish(),
  additions: z.number().int(),
  deletions: z.number().int(),
  finding_lines: z.array(z.number().int()),
});
export type SmartDiffFile = z.infer<typeof SmartDiffFile>;

export const SmartDiffGroup = z.object({
  role: SmartDiffRole,
  files: z.array(SmartDiffFile),
});
export type SmartDiffGroup = z.infer<typeof SmartDiffGroup>;

export const ProposedSplit = z.object({
  name: z.string(),
  files: z.array(z.string()),
});
export type ProposedSplit = z.infer<typeof ProposedSplit>;

export const SmartDiff = z.object({
  groups: z.array(SmartDiffGroup),
  split_suggestion: z.object({
    too_big: z.boolean(),
    total_lines: z.number().int(),
    proposed_splits: z.array(ProposedSplit),
  }),
});
export type SmartDiff = z.infer<typeof SmartDiff>;

// ---- Review focus ----
export const ReviewFocusItem = z.object({
  file: z.string(),
  line: z.number().int(),
  reason: z.string(),
});
export type ReviewFocusItem = z.infer<typeof ReviewFocusItem>;

// ---- Brief provenance ----
export const BriefInputKind = z.enum(['intent', 'blast', 'files', 'pr_description', 'issue', 'spec']);
export type BriefInputKind = z.infer<typeof BriefInputKind>;

export const BriefInputStatus = z.enum([
  'ok',
  'missing',
  'stale',
  'degraded',
  'truncated',
  'over_budget',
  'unavailable',
]);
export type BriefInputStatus = z.infer<typeof BriefInputStatus>;

export const BriefInput = z.object({
  kind: BriefInputKind,
  ref: z.string().max(200),
  status: BriefInputStatus,
  reason: BlastDegradedReason.nullish(),
  shown: z.number().int().nullish(),
  total: z.number().int().nullish(),
});
export type BriefInput = z.infer<typeof BriefInput>;

// ---- Composed PR Brief (pr_brief.json) ----
export const PrBrief = z.object({
  summary: z.string(),
  risks: z.array(Risk),
  review_focus: z.array(ReviewFocusItem),
  head_sha: z.string(),
  generated_at: z.string(),
  prompt_version: z.string(),
  input_hash: z.string(),
  provider: z.string(),
  model: z.string(),
  tokens_in: z.number().int(),
  tokens_out: z.number().int(),
  cost_usd: z.number().nullable(),
  duration_ms: z.number().int(),
  attempts: z.number().int(),
  inputs: z.array(BriefInput),
  dropped: z.object({ risks: z.number().int(), review_focus: z.number().int() }),
});
export type PrBrief = z.infer<typeof PrBrief>;

/** Own enum: importing review-api's staleness enum here would be circular. */
export const BriefStaleReason = z.enum(['head_moved', 'description_changed', 'prompt_updated']);
export type BriefStaleReason = z.infer<typeof BriefStaleReason>;

export const PrBriefResponse = z.object({
  brief: PrBrief.nullable(),
  stale: z.boolean(),
  stale_reason: BriefStaleReason.nullable(),
});
export type PrBriefResponse = z.infer<typeof PrBriefResponse>;

/** LLM output (strict json_schema: all required, no length limits; refs may be empty before post-validation). */
export const BriefModelOutput = z.object({
  summary: z.string(),
  risks: z.array(
    z.object({
      kind: z.string(),
      title: z.string(),
      explanation: z.string(),
      severity: RiskSeverity,
      refs: z.array(RiskRef),
    }),
  ),
  review_focus: z.array(ReviewFocusItem),
});
export type BriefModelOutput = z.infer<typeof BriefModelOutput>;
