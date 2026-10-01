import type { Agent, ConventionSkillDraft, SkillType } from "@devdigest/shared";
import { SKILL_BODY_MAX, skillNameError } from "@/lib/skill-helpers";
import { DEFAULT_AGENT_NAME, NO_AGENT } from "./constants";

export interface SkillForm {
  name: string;
  description: string;
  type: SkillType;
  enabled: boolean;
  body: string;
}

export const fromDraft = (d: ConventionSkillDraft): SkillForm => ({
  name: d.name,
  description: d.description,
  type: d.type,
  enabled: true,
  body: d.body,
});

/** General Reviewer when it exists, otherwise "Don't link". */
export function defaultAgentId(agents: readonly Pick<Agent, "id" | "name">[] | undefined): string {
  return agents?.find((a) => a.name === DEFAULT_AGENT_NAME)?.id ?? NO_AGENT;
}

export type NameErrorKey = "modal.nameRequired" | "modal.nameInvalid" | "modal.nameTaken";
export type BodyErrorKey = "modal.bodyRequired" | "modal.bodyTooLong";

/** Format errors show while typing, "required" after a submit, "taken" for the 409'd name. */
export function nameError(name: string, submitted: boolean, takenName: string | null): NameErrorKey | null {
  const err = skillNameError(name);
  if (err === "invalid") return "modal.nameInvalid";
  if (err === "required") return submitted ? "modal.nameRequired" : null;
  return takenName !== null && takenName === name ? "modal.nameTaken" : null;
}

export function bodyError(body: string, submitted: boolean): BodyErrorKey | null {
  if (!body.trim()) return submitted ? "modal.bodyRequired" : null;
  return body.length > SKILL_BODY_MAX ? "modal.bodyTooLong" : null;
}
