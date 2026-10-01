import { z } from 'zod';
import { SeverityCounts } from './findings.js';

/**
 * Conformance, Onboarding, Eval, Memory, Conventions, Skills,
 * Agents and their DTOs.
 */

// ---- Conformance ----
export const ConformanceStatus = z.enum(['implemented', 'missing', 'out_of_scope']);
export type ConformanceStatus = z.infer<typeof ConformanceStatus>;

export const ConformanceItem = z.object({
  requirement: z.string(),
  status: ConformanceStatus,
  evidence_file: z.string().nullish(),
  notes: z.string().nullish(),
});
export type ConformanceItem = z.infer<typeof ConformanceItem>;

export const Conformance = z.object({
  spec_id: z.string(),
  spec_title: z.string(),
  items: z.array(ConformanceItem),
  completeness_pct: z.number().min(0).max(100),
});
export type Conformance = z.infer<typeof Conformance>;

// ---- Onboarding ----
export const OnboardingLink = z.object({
  label: z.string(),
  path: z.string(),
});
export type OnboardingLink = z.infer<typeof OnboardingLink>;

export const OnboardingSection = z.object({
  kind: z.string(),
  title: z.string(),
  body: z.string(), // markdown
  diagram: z.string().nullish(), // mermaid
  links: z.array(OnboardingLink),
});
export type OnboardingSection = z.infer<typeof OnboardingSection>;

export const Onboarding = z.object({
  sections: z.array(OnboardingSection),
});
export type Onboarding = z.infer<typeof Onboarding>;

// ---- Eval ----
export const EvalPerTrace = z.object({
  name: z.string(),
  pass: z.boolean(),
  expected: z.unknown(),
  actual: z.unknown(),
});
export type EvalPerTrace = z.infer<typeof EvalPerTrace>;

export const EvalRun = z.object({
  recall: z.number().min(0).max(1),
  precision: z.number().min(0).max(1),
  citation_accuracy: z.number().min(0).max(1),
  traces_passed: z.number().int(),
  traces_total: z.number().int(),
  duration_ms: z.number().int(),
  cost_usd: z.number().nullable(),
  per_trace: z.array(EvalPerTrace),
});
export type EvalRun = z.infer<typeof EvalRun>;

export const EvalOwnerKind = z.enum(['skill', 'agent']);
export type EvalOwnerKind = z.infer<typeof EvalOwnerKind>;

export const EvalCase = z.object({
  id: z.string(),
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string(),
  input_diff: z.string(),
  input_files: z.unknown(),
  input_meta: z.unknown(),
  expected_output: z.unknown(),
  notes: z.string().nullish(),
});
export type EvalCase = z.infer<typeof EvalCase>;

// ---- Memory ----
export const MemoryScope = z.enum(['repo', 'global', 'team']);
export type MemoryScope = z.infer<typeof MemoryScope>;

export const MemoryKind = z.enum([
  'decision',
  'convention',
  'preference',
  'fact',
  'learning',
]);
export type MemoryKind = z.infer<typeof MemoryKind>;

export const MemorySource = z.object({
  pr: z.number().int().nullish(),
  context: z.string(),
});
export type MemorySource = z.infer<typeof MemorySource>;

export const MemoryItem = z.object({
  content: z.string(),
  scope: MemoryScope,
  kind: MemoryKind,
  confidence: z.number().min(0).max(1),
  sources: z.array(MemorySource),
});
export type MemoryItem = z.infer<typeof MemoryItem>;

// ---- Skills ----
export const SkillType = z.enum(['rubric', 'convention', 'security', 'custom']);
export type SkillType = z.infer<typeof SkillType>;

// 'imported' = created from an uploaded .md / .zip file (L02 import flow).
export const SkillSource = z.enum(['manual', 'imported', 'imported_url', 'extracted', 'community']);
export type SkillSource = z.infer<typeof SkillSource>;

export const Skill = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: SkillType,
  source: SkillSource,
  body: z.string(),
  enabled: z.boolean(),
  version: z.number().int(),
  evidence_files: z.array(z.string()).nullish(),
  /** Number of agents this skill is linked to (any link, enabled or not). `GET /skills*` only. */
  agent_count: z.number().int().optional(),
  created_at: z.string().optional(),
  /** Injection scan of the current body (`GET /skills*`). */
  security: z.lazy(() => SkillSecurity).optional(),
});
export type Skill = z.infer<typeof Skill>;

// ---- Skill injection analysis (L03b) ----
/** One prompt-injection pattern found in a skill body. */
export const SkillInjectionFinding = z.object({
  /** Stable detector rule id, e.g. `ignore-instructions`, `verdict-forcing`. */
  rule: z.string(),
  /** Short human label for the rule, e.g. "Overrides previous instructions". */
  label: z.string(),
  severity: z.enum(['high', 'medium']),
  /** 1-based line in the body. */
  line: z.number().int().min(1),
  /** The offending text, trimmed to ≤ 120 chars. */
  excerpt: z.string(),
});
export type SkillInjectionFinding = z.infer<typeof SkillInjectionFinding>;

/**
 * Result of the rule-based injection scan of a skill body, computed on every read.
 * `blocked` = at least one finding: the skill never reaches a prompt and cannot be
 * enabled on an agent until its body is cleaned.
 */
export const SkillSecurity = z.object({
  status: z.enum(['clean', 'blocked']),
  findings: z.array(SkillInjectionFinding),
});
export type SkillSecurity = z.infer<typeof SkillSecurity>;

/** Skill names are kebab-case slugs: they label prompt blocks and trace entries. */
export const SkillName = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'Use lowercase letters, digits and dashes (kebab-case)');

/** Max skill body size (chars). Skills are prompt text; keep them small. */
export const SKILL_BODY_MAX = 20_000;

export const CreateSkillBody = z.object({
  name: SkillName,
  description: z.string().max(500).default(''),
  type: SkillType,
  body: z.string().min(1).max(SKILL_BODY_MAX),
  enabled: z.boolean().optional(),
});
export type CreateSkillBody = z.infer<typeof CreateSkillBody>;

/** Partial update. A change to name/description/type/body creates a new version. */
export const UpdateSkillBody = z.object({
  name: SkillName.optional(),
  description: z.string().max(500).optional(),
  type: SkillType.optional(),
  body: z.string().min(1).max(SKILL_BODY_MAX).optional(),
  enabled: z.boolean().optional(),
  /** Optional version note shown in the Versioning tab. */
  message: z.string().max(200).optional(),
});
export type UpdateSkillBody = z.infer<typeof UpdateSkillBody>;

/** One immutable snapshot in `skill_versions`. */
export const SkillVersion = z.object({
  version: z.number().int(),
  body: z.string(),
  message: z.string().nullable(),
  created_at: z.string(),
});
export type SkillVersion = z.infer<typeof SkillVersion>;

/** Import upload: a single `.md` or `.zip` file, base64-encoded (JSON, no multipart). */
export const SkillImportRequest = z.object({
  filename: z.string().min(1).max(255),
  content_base64: z.string().min(1),
});
export type SkillImportRequest = z.infer<typeof SkillImportRequest>;

/** Parsed "core" of an imported file, returned before anything is saved. */
export const SkillImportPreview = z.object({
  name: z.string(),
  description: z.string(),
  type: SkillType,
  body: z.string(),
  /** Path of the markdown file the core came from (the file itself, or SKILL.md inside the zip). */
  source_file: z.string(),
  /** Archive entries that were ignored — skills are text only, nothing else is used. */
  ignored_files: z.array(z.string()),
  warnings: z.array(z.string()),
  /** Injection scan of the parsed body — a blocked file can still be imported, but stays blocked. */
  security: z.lazy(() => SkillSecurity).optional(),
  /** URL imports only: the final URL the file was fetched from (after GitHub blob → raw rewrite). */
  source_url: z.string().optional(),
});
export type SkillImportPreview = z.infer<typeof SkillImportPreview>;

/** Commit an import: same upload plus optional edits made in the preview. Saved with source='imported'. */
export const SkillImportCommit = SkillImportRequest.extend({
  name: SkillName.optional(),
  description: z.string().max(500).optional(),
  type: SkillType.optional(),
});
export type SkillImportCommit = z.infer<typeof SkillImportCommit>;

/** Import from a URL (L03c): a raw `.md` / `.markdown` / `.txt` file fetched by the server. */
export const SkillUrlImportRequest = z.object({
  url: z.string().url().max(2048),
});
export type SkillUrlImportRequest = z.infer<typeof SkillUrlImportRequest>;

/** Commit a URL import with optional edits from the preview. Saved with source='imported_url'. */
export const SkillUrlImportCommit = SkillUrlImportRequest.extend({
  name: SkillName.optional(),
  description: z.string().max(500).optional(),
  type: SkillType.optional(),
});
export type SkillUrlImportCommit = z.infer<typeof SkillUrlImportCommit>;

export const CommunitySkill = z.object({
  name: z.string(),
  repo: z.string(),
  stars: z.number().int(),
  lang: z.string(),
  desc: z.string(),
});
export type CommunitySkill = z.infer<typeof CommunitySkill>;

// ---- Conventions (L03) ----
export const ConventionCategory = z.enum([
  'naming',
  'structure',
  'imports',
  'error-handling',
  'async',
  'typing',
  'testing',
  'formatting',
  'other',
]);
export type ConventionCategory = z.infer<typeof ConventionCategory>;

/** pending = shown for review; accepted = goes into the skill; rejected = hidden for good. */
export const ConventionStatus = z.enum(['pending', 'accepted', 'rejected']);
export type ConventionStatus = z.infer<typeof ConventionStatus>;

/**
 * What the model must return per convention (req 40): category, rule, evidence
 * (file + line range), confidence. The server grounds it against the sampled files
 * and fills the snippet itself.
 */
export const ExtractedConvention = z.object({
  category: ConventionCategory,
  rule: z.string().min(3).max(300),
  evidence: z.object({
    file: z.string(),
    start_line: z.number().int().min(1),
    end_line: z.number().int().min(1),
  }),
  confidence: z.number().min(0).max(1),
});
export type ExtractedConvention = z.infer<typeof ExtractedConvention>;

export const ExtractedConventions = z.object({ conventions: z.array(ExtractedConvention) });
export type ExtractedConventions = z.infer<typeof ExtractedConventions>;

export const ConventionCandidate = z.object({
  id: z.string(),
  category: ConventionCategory,
  rule: z.string(),
  evidence_path: z.string(),
  evidence_start_line: z.number().int().nullable(),
  evidence_end_line: z.number().int().nullable(),
  evidence_snippet: z.string(),
  confidence: z.number().min(0).max(1),
  status: ConventionStatus,
  /** Mirror of status === 'accepted' (kept for older readers). */
  accepted: z.boolean(),
  /** True once the user edited the card inline; re-scans never overwrite it. */
  edited: z.boolean(),
  created_at: z.string(),
});
export type ConventionCandidate = z.infer<typeof ConventionCandidate>;

export const ConventionScanStatus = z.enum(['running', 'done', 'failed']);
export type ConventionScanStatus = z.infer<typeof ConventionScanStatus>;

export const ConventionScan = z.object({
  id: z.string(),
  repo_id: z.string(),
  status: ConventionScanStatus,
  /** Files sent to the model: configs first, then top-ranked samples (req 39). */
  sample_files: z.array(z.string()),
  provider: z.string(),
  model: z.string(),
  candidates_found: z.number().int().nullable(),
  error: z.string().nullable(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
});
export type ConventionScan = z.infer<typeof ConventionScan>;

/** `GET /repos/:id/conventions` — rejected candidates are never returned (req 48). */
export const ConventionsState = z.object({
  repo_id: z.string(),
  repo_name: z.string(),
  /** False when repo-intel has no ranked files for the repo — scanning can't sample. */
  indexed: z.boolean(),
  scan: ConventionScan.nullable(),
  candidates: z.array(ConventionCandidate),
});
export type ConventionsState = z.infer<typeof ConventionsState>;

/** Inline edit / accept / reject of one candidate. */
export const UpdateConventionBody = z
  .object({
    status: ConventionStatus.optional(),
    rule: z.string().min(3).max(300).optional(),
    category: ConventionCategory.optional(),
    evidence_path: z.string().min(1).optional(),
    evidence_start_line: z.number().int().min(1).nullable().optional(),
    evidence_end_line: z.number().int().min(1).nullable().optional(),
    evidence_snippet: z.string().max(4000).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to update' });
export type UpdateConventionBody = z.infer<typeof UpdateConventionBody>;

/** `POST /repos/:id/conventions/skill-draft` — the editable starting point of the modal (req 41). */
export const ConventionSkillDraftRequest = z.object({ candidate_ids: z.array(z.string().uuid()).min(1) });
export type ConventionSkillDraftRequest = z.infer<typeof ConventionSkillDraftRequest>;

export const ConventionSkillDraft = z.object({
  name: z.string(),
  description: z.string(),
  type: SkillType,
  body: z.string(),
});
export type ConventionSkillDraft = z.infer<typeof ConventionSkillDraft>;

/** `POST /repos/:id/conventions/skill` — create the skill (req 42, 51) and optionally link it. */
export const CreateConventionSkillBody = z.object({
  candidate_ids: z.array(z.string().uuid()).min(1),
  name: SkillName,
  description: z.string().max(500).default(''),
  type: SkillType.default('convention'),
  enabled: z.boolean().default(true),
  body: z.string().min(1).max(SKILL_BODY_MAX),
  /** Agent to link the new skill to (appended, enabled); null = don't link. */
  agent_id: z.string().uuid().nullable(),
});
export type CreateConventionSkillBody = z.infer<typeof CreateConventionSkillBody>;

export const CreateConventionSkillResult = z.object({
  skill: Skill,
  linked_agent_id: z.string().nullable(),
});
export type CreateConventionSkillResult = z.infer<typeof CreateConventionSkillResult>;

// ---- Agents ----
// 'openrouter' routes through the OpenAI-compatible API (OpenAIProvider with a
// custom baseURL) — used by the CI runner for cheap models (DeepSeek/GLM/MiniMax).
export const Provider = z.enum(['openai', 'anthropic', 'openrouter']);
export type Provider = z.infer<typeof Provider>;

// Review execution strategy (matches @devdigest/reviewer-core's ReviewStrategy):
//  - single-pass: send the WHOLE diff in ONE model call (default)
//  - map-reduce:  one model call PER changed file (for very large diffs)
//  - auto:        single-pass, switching to map-reduce when the diff is large
export const ReviewStrategy = z.enum(['single-pass', 'map-reduce', 'auto']);
export type ReviewStrategy = z.infer<typeof ReviewStrategy>;

// CI gate policy — when a review should BLOCK (REQUEST_CHANGES + fail the check)
// vs just comment. Deterministic from finding severities, NOT the model's verdict:
//  - never:    never block, always comment (advisory only)
//  - critical: block iff >=1 CRITICAL finding (default)
//  - warning:  block iff >=1 WARNING or CRITICAL finding
//  - any:      block iff >=1 finding of any severity
export const CiFailOn = z.enum(['never', 'critical', 'warning', 'any']);
export type CiFailOn = z.infer<typeof CiFailOn>;

export const Agent = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  enabled: z.boolean(),
  version: z.number().int(),
  strategy: ReviewStrategy.default('single-pass'),
  ci_fail_on: CiFailOn.default('critical'),
  // Inject repo-intel context (repo skeleton + callers + rank note) into this
  // agent's review prompt. Default on; gated again by the global flag.
  repo_intel: z.boolean().default(true),
  // Active findings by severity across the workspace (latest review per PR for
  // this agent, dismissed excluded); null = no reviews yet. `GET /agents` only.
  findings: SeverityCounts.nullish(),
  /** Linked skills with the per-agent switch on. `GET /agents` / `GET /agents/:id`. */
  skill_count: z.number().int().optional(),
});
export type Agent = z.infer<typeof Agent>;

export const AgentSkillLink = z.object({
  agent_id: z.string(),
  skill_id: z.string(),
  order: z.number().int(),
  /** Per-agent switch. A skill reaches the prompt only if this AND `Skill.enabled` are true. */
  enabled: z.boolean().default(true),
});
export type AgentSkillLink = z.infer<typeof AgentSkillLink>;

// The immutable config snapshot captured in `agent_versions` whenever an agent's
// config changes (everything but `enabled`). Mirrors the shape written by the
// agents repository — provider/model/prompt/output_schema/strategy/gate/repo_intel
// plus the ordered skill ids linked at snapshot time. Used for reproducibility
// (eval replays a past version) and for surfacing an agent's edit history.
export const AgentVersionConfig = z.object({
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  strategy: ReviewStrategy,
  ci_fail_on: CiFailOn,
  repo_intel: z.boolean(),
  skills: z.array(z.string()),
});
export type AgentVersionConfig = z.infer<typeof AgentVersionConfig>;

export const AgentVersion = z.object({
  agent_id: z.string(),
  version: z.number().int(),
  config: AgentVersionConfig,
  created_at: z.string(),
});
export type AgentVersion = z.infer<typeof AgentVersion>;
