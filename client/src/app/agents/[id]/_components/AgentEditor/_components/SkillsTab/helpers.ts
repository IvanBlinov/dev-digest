import type { AgentSkillLink, Skill } from "@devdigest/shared";

/** One agent→skill link in prompt order (the `POST /agents/:id/skills` item shape). */
export interface LinkItem {
  skill_id: string;
  enabled: boolean;
}

/** A row of the Skills tab: a skill plus its per-agent state. */
export interface SkillRow {
  skill: Skill;
  /** Per-agent checkbox state (link exists AND link.enabled). */
  checked: boolean;
  /** Skill-level kill-switch is off — row greyed, checkbox disabled. */
  globallyDisabled: boolean;
  /** Only enabled links can be reordered. */
  draggable: boolean;
}

const enabledOf = (items: readonly LinkItem[]) => items.filter((i) => i.enabled);
const disabledOf = (items: readonly LinkItem[]) => items.filter((i) => !i.enabled);

/** Server links → ordered items: enabled links by `order`, then disabled ones by `order`. */
export function linksToItems(links: readonly AgentSkillLink[]): LinkItem[] {
  const sorted = [...links]
    .sort((a, b) => a.order - b.order)
    .map((l) => ({ skill_id: l.skill_id, enabled: l.enabled !== false }));
  return [...enabledOf(sorted), ...disabledOf(sorted)];
}

/** A skill can be checked only while its global toggle is on. */
export function canCheck(skill: Skill): boolean {
  return skill.enabled;
}

/** Enabled links in link order (draggable), then every other skill alphabetically. */
export function buildRows(skills: readonly Skill[], items: readonly LinkItem[]): SkillRow[] {
  const byId = new Map(skills.map((sk) => [sk.id, sk]));
  const enabledIds = enabledOf(items)
    .map((i) => i.skill_id)
    .filter((id) => byId.has(id));
  const enabledSet = new Set(enabledIds);
  const head = enabledIds.map((id) => byId.get(id)!);
  const tail = skills.filter((sk) => !enabledSet.has(sk.id)).sort((a, b) => a.name.localeCompare(b.name));
  return [
    ...head.map((skill) => ({ skill, checked: true, globallyDisabled: !skill.enabled, draggable: true })),
    ...tail.map((skill) => ({ skill, checked: false, globallyDisabled: !skill.enabled, draggable: false })),
  ];
}

/** Check → append to the end of the enabled list; uncheck → keep the link with enabled=false. */
export function toggleSkill(items: readonly LinkItem[], skillId: string, on: boolean): LinkItem[] {
  const rest = items.filter((i) => i.skill_id !== skillId);
  const entry = { skill_id: skillId, enabled: on };
  return on
    ? [...enabledOf(rest), entry, ...disabledOf(rest)]
    : [...enabledOf(rest), ...disabledOf(rest), entry];
}

function moveEnabled(items: readonly LinkItem[], from: number, to: number): LinkItem[] {
  const enabled = enabledOf(items);
  if (from === to || from < 0 || to < 0 || from >= enabled.length || to >= enabled.length) return [...items];
  const next = [...enabled];
  const moved = next.splice(from, 1);
  next.splice(to, 0, ...moved);
  return [...next, ...disabledOf(items)];
}

/** Keyboard ↑/↓: shift an enabled skill by `delta` within the enabled list (clamped). */
export function moveSkill(items: readonly LinkItem[], skillId: string, delta: number): LinkItem[] {
  const enabled = enabledOf(items);
  const from = enabled.findIndex((i) => i.skill_id === skillId);
  if (from < 0) return [...items];
  const to = Math.min(Math.max(from + delta, 0), enabled.length - 1);
  return moveEnabled(items, from, to);
}

/** Drag & drop: put `fromId` at the position of `toId` (both must be enabled links). */
export function reorderSkill(items: readonly LinkItem[], fromId: string, toId: string): LinkItem[] {
  const enabled = enabledOf(items);
  const from = enabled.findIndex((i) => i.skill_id === fromId);
  const to = enabled.findIndex((i) => i.skill_id === toId);
  if (from < 0 || to < 0) return [...items];
  return moveEnabled(items, from, to);
}

/** Request body: enabled links in prompt order, then linked-but-disabled ones. */
export function toPayload(items: readonly LinkItem[]): { items: LinkItem[] } {
  return { items: [...enabledOf(items), ...disabledOf(items)].map((i) => ({ ...i })) };
}

/** Case-insensitive name filter. */
export function filterRows(rows: readonly SkillRow[], query: string): SkillRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...rows];
  return rows.filter((r) => r.skill.name.toLowerCase().includes(q));
}

/** Skills that actually reach the prompt: checked here AND globally enabled. */
export function countEffective(rows: readonly SkillRow[]): number {
  return rows.filter((r) => r.checked && !r.globallyDisabled).length;
}
