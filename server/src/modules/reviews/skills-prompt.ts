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

/** One enabled skill as resolved for an agent (matches SkillsRepository.effectiveSkillsForAgent). */
export interface EffectiveSkill {
  id: string;
  name: string;
  version: number;
  type: string;
  body: string;
}

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

export function formatSkillBlock(skill: EffectiveSkill): string {
  return `### Skill: ${skill.name} (v${skill.version}, ${skill.type})\n${skill.body}`;
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
