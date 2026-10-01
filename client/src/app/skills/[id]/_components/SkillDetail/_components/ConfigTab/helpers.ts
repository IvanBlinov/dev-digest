import type { Skill, UpdateSkillBody } from "@devdigest/shared";

export interface ConfigDraft {
  name: string;
  description: string;
  type: Skill["type"];
  body: string;
}

export const draftFrom = (skill: Skill): ConfigDraft => ({
  name: skill.name,
  description: skill.description,
  type: skill.type,
  body: skill.body,
});

/** Only the fields that differ from the saved skill, plus the optional version note. */
export function buildPatch(skill: Skill, draft: ConfigDraft, note: string): UpdateSkillBody {
  const saved = draftFrom(skill);
  const changed = (Object.keys(draft) as (keyof ConfigDraft)[]).filter((k) => draft[k] !== saved[k]);
  const patch: UpdateSkillBody = Object.fromEntries(changed.map((k) => [k, draft[k]]));
  return note.trim() ? { ...patch, message: note.trim() } : patch;
}

export function isDirty(skill: Skill, draft: ConfigDraft): boolean {
  return Object.keys(buildPatch(skill, draft, "")).length > 0;
}
