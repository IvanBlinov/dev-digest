/* skill-helpers.ts — pure helpers for the Skills Lab (token estimate, name validation,
   list filtering, import file checks).
   NOTE: only *type* imports from @devdigest/shared — its barrel re-exports with `.js`
   extensions that Next's webpack cannot resolve, so runtime values are mirrored here and
   pinned to the contract by skill-helpers.test.ts. */
import type { Skill, SkillType } from "@devdigest/shared";

/** Mirrors `SkillName` (contracts/knowledge.ts): kebab-case slug, 2–64 chars. */
export const SKILL_NAME_RE = /^[a-z0-9][a-z0-9-]*$/;
export const SKILL_NAME_MIN = 2;
export const SKILL_NAME_MAX = 64;
/** Mirrors `SKILL_BODY_MAX`. */
export const SKILL_BODY_MAX = 20_000;

/** Client-side token estimate shown in the editor ("~N tokens"): ceil(length / 4). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export type SkillNameError = "required" | "invalid";

/** Mirrors the `SkillName` contract (kebab-case, 2–64 chars). */
export function skillNameError(name: string): SkillNameError | null {
  if (!name.trim()) return "required";
  const ok = name.length >= SKILL_NAME_MIN && name.length <= SKILL_NAME_MAX && SKILL_NAME_RE.test(name);
  return ok ? null : "invalid";
}

/** Case-insensitive filter over a skill's name + description. */
export function filterSkills(skills: readonly Skill[], query: string): Skill[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...skills];
  return skills.filter((s) => `${s.name} ${s.description}`.toLowerCase().includes(q));
}

export type ImportKind = "md" | "zip";

/** Only `.md` and `.zip` uploads are accepted by the import flow. */
export function importKind(filename: string): ImportKind | null {
  const m = /\.([a-z0-9]+)$/i.exec(filename);
  const ext = m?.[1]?.toLowerCase();
  return ext === "md" || ext === "zip" ? ext : null;
}

/** Read a browser File as base64 (no `data:` prefix) for `SkillImportRequest.content_base64`. */
export function readFileAsBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

/** Option list for the skill Type select (create, import, config). */
export const SKILL_TYPES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

export interface SkillMeta {
  name: string;
  description: string;
  type: SkillType;
}
