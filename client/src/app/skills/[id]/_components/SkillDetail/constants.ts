export const SKILL_TABS = ["config", "preview", "versioning"] as const;
export type SkillTab = (typeof SKILL_TABS)[number];
export const HTTP_NOT_FOUND = 404;
