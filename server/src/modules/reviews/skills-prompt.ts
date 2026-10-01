/**
 * L02 — turn an agent's effective skills into prompt blocks + trace records.
 *
 * Pure (no DB / network): the caller resolves the effective skills (only
 * link.enabled AND skill.enabled, in link order) and passes them here. The
 * formatted texts go to reviewer-core as `skills: string[]`; reviewer-core joins
 * them with SKILLS_JOINER into the `## Skills / rules` section, so the total
 * token count is taken over that exact joined text.
 */
import type { SkillPromptBlock } from '@devdigest/shared';
import type { Tokenizer } from '../../adapters/tokenizer/index.js';
import type { EffectiveSkill } from '../skills/repository.js';
import { isSkillBlocked } from '../skills/injection.js';

/** Defined once by its owner (the skills repository); re-exported for callers of this module. */
export type { EffectiveSkill };

/** Port the executor reads effective skills through (implemented by SkillsRepository). */
export interface EffectiveSkillsSource {
  effectiveSkillsForAgent(agentId: string): Promise<EffectiveSkill[]>;
}

/** Must match how reviewer-core joins `parts.skills` (reviewer-core/src/prompt.ts:89). */
export const SKILLS_JOINER = '\n\n';

export interface SkillsPromptPlan {
  /** Block texts in prompt order — passed verbatim as `skills` to reviewPullRequest. */
  texts: string[];
  /** Trace records in prompt order. */
  blocks: SkillPromptBlock[];
  /** Tokens of the whole joined skills section; null when no skill is injected. */
  totalTokens: number | null;
}

/** The skill header is `###`; body headings are pushed below it by this many levels. */
const HEADING_DEMOTION = 3;
const MAX_HEADING_LEVEL = 6;
/** ATX heading: up to 3 spaces, 1–6 `#`, then whitespace or end of line. */
const ATX_HEADING_RE = /^( {0,3})(#{1,6})(?=[ \t]|$)/;
/** Opening/closing code fence: up to 3 spaces, then ≥3 backticks or tildes. */
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;
/** reviewer-core's untrusted-data delimiters (`<untrusted …>` / `</untrusted>`, reviewer-core/src/prompt.ts:33). */
const UNTRUSTED_DELIMITER_RE = /<(\/?\s*untrusted)/gi;

/**
 * Header + hardened body. Skill bodies (some imported from third-party files)
 * sit verbatim under reviewer-core's `## Skills / rules`, so the body must not be
 * able to open a fake top-level section (`## Diff to review`, `# System`) or
 * forge the prompt's untrusted-data delimiters.
 */
export function formatSkillBlock(skill: EffectiveSkill): string {
  return `### Skill: ${skill.name} (v${skill.version}, ${skill.type})\n${hardenSkillBody(skill.body)}`;
}

/**
 * Demote every ATX heading outside fenced code by HEADING_DEMOTION levels
 * (capped at 6) and neutralise delimiter look-alikes everywhere (`<` → `&lt;`
 * on those tokens only). Pure.
 */
export function hardenSkillBody(body: string): string {
  let fence: string | null = null;
  return body
    .split('\n')
    .map((line) => {
      const fenceMatch = FENCE_RE.exec(line);
      if (fenceMatch) {
        const marker = fenceMatch[1]!;
        if (fence === null) fence = marker;
        else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      }
      const text = fenceMatch || fence !== null ? line : demoteHeading(line);
      return text.replace(UNTRUSTED_DELIMITER_RE, '&lt;$1');
    })
    .join('\n');
}

function demoteHeading(line: string): string {
  const m = ATX_HEADING_RE.exec(line);
  if (!m) return line;
  const level = Math.min(m[2]!.length + HEADING_DEMOTION, MAX_HEADING_LEVEL);
  return `${m[1]}${'#'.repeat(level)}${line.slice(m[0].length)}`;
}

export function buildSkillsPrompt(skills: readonly EffectiveSkill[], tokenizer: Tokenizer): SkillsPromptPlan {
  if (skills.length === 0) return { texts: [], blocks: [], totalTokens: null };
  const texts = skills.map(formatSkillBlock);
  const blocks: SkillPromptBlock[] = skills.map((s, i) => ({
    skill_id: s.id,
    name: s.name,
    version: s.version,
    type: s.type,
    tokens: tokenizer.count(texts[i]!),
    text: texts[i]!,
  }));
  return { texts, blocks, totalTokens: tokenizer.count(texts.join(SKILLS_JOINER)) };
}

export function skillsLogLine(plan: SkillsPromptPlan): string {
  if (plan.blocks.length === 0) return 'skills: none enabled for this agent';
  return `skills: ${plan.blocks.length} injected (${plan.totalTokens} tokens)`;
}

/**
 * L03b — split effective skills into those that may reach the prompt and those
 * whose body has an injection finding. Order is preserved. Pure.
 */
export function partitionBlockedSkills<T extends Pick<EffectiveSkill, 'name' | 'body'>>(
  skills: readonly T[],
): { allowed: T[]; blocked: T[] } {
  const allowed = skills.filter((s) => !isSkillBlocked(s.body));
  const blocked = skills.filter((s) => isSkillBlocked(s.body));
  return { allowed, blocked };
}

/** Run-log line for skipped skills, or null when none was skipped. */
export function blockedSkillsLogLine(blocked: ReadonlyArray<Pick<EffectiveSkill, 'name'>>): string | null {
  if (blocked.length === 0) return null;
  return `skills: ${blocked.length} skipped — injection detected (${blocked.map((s) => s.name).join(', ')})`;
}
