import { describe, it, expect } from "vitest";
import type { AgentSkillLink, Skill } from "@devdigest/shared";
import {
  linksToItems,
  buildRows,
  toggleSkill,
  moveSkill,
  reorderSkill,
  toPayload,
  filterRows,
  countEffective,
  canCheck,
} from "./helpers";

function skill(id: string, name: string, enabled = true): Skill {
  return {
    id,
    name,
    description: "",
    type: "custom",
    source: "manual",
    body: "b",
    enabled,
    version: 1,
  } as Skill;
}

const SKILLS: Skill[] = [
  skill("s1", "zeta-rules"),
  skill("s2", "alpha-guard"),
  skill("s3", "mid-check"),
  skill("s4", "beta-off", false),
  skill("s5", "gamma"),
];

const link = (skill_id: string, order: number, enabled = true): AgentSkillLink => ({
  agent_id: "ag1",
  skill_id,
  order,
  enabled,
});

describe("linksToItems", () => {
  it("sorts by order and puts enabled links before disabled ones", () => {
    const items = linksToItems([link("s3", 2), link("s1", 0, false), link("s5", 1)]);
    expect(items).toEqual([
      { skill_id: "s5", enabled: true },
      { skill_id: "s3", enabled: true },
      { skill_id: "s1", enabled: false },
    ]);
  });
});

describe("buildRows", () => {
  it("lists enabled links in link order first, then every other skill alphabetically", () => {
    const items = [
      { skill_id: "s3", enabled: true },
      { skill_id: "s1", enabled: true },
      { skill_id: "s5", enabled: false },
    ];
    const rows = buildRows(SKILLS, items);
    expect(rows.map((r) => r.skill.name)).toEqual(["mid-check", "zeta-rules", "alpha-guard", "beta-off", "gamma"]);
    expect(rows.map((r) => r.draggable)).toEqual([true, true, false, false, false]);
    expect(rows.map((r) => r.checked)).toEqual([true, true, false, false, false]);
  });

  it("ignores links to skills that no longer exist", () => {
    const rows = buildRows(SKILLS, [{ skill_id: "gone", enabled: true }]);
    expect(rows).toHaveLength(SKILLS.length);
    expect(rows.every((r) => !r.checked)).toBe(true);
  });

  it("marks a globally disabled skill as not checkable", () => {
    const rows = buildRows(SKILLS, []);
    const off = rows.find((r) => r.skill.id === "s4")!;
    expect(off.globallyDisabled).toBe(true);
    expect(canCheck(off.skill)).toBe(false);
    expect(canCheck(skill("x", "on"))).toBe(true);
  });
});

describe("toggleSkill", () => {
  const items = [
    { skill_id: "s1", enabled: true },
    { skill_id: "s2", enabled: true },
    { skill_id: "s3", enabled: false },
  ];

  it("checking appends the skill to the end of the enabled list", () => {
    expect(toggleSkill(items, "s5", true)).toEqual([
      { skill_id: "s1", enabled: true },
      { skill_id: "s2", enabled: true },
      { skill_id: "s5", enabled: true },
      { skill_id: "s3", enabled: false },
    ]);
  });

  it("re-checking a linked-but-disabled skill moves it to the end of the enabled list", () => {
    expect(toggleSkill(items, "s3", true)).toEqual([
      { skill_id: "s1", enabled: true },
      { skill_id: "s2", enabled: true },
      { skill_id: "s3", enabled: true },
    ]);
  });

  it("unchecking keeps the link with enabled=false after the enabled ones", () => {
    expect(toggleSkill(items, "s1", false)).toEqual([
      { skill_id: "s2", enabled: true },
      { skill_id: "s3", enabled: false },
      { skill_id: "s1", enabled: false },
    ]);
  });

  it("does not mutate the input", () => {
    const copy = JSON.parse(JSON.stringify(items));
    toggleSkill(items, "s1", false);
    expect(items).toEqual(copy);
  });
});

describe("moveSkill / reorderSkill", () => {
  const items = [
    { skill_id: "s1", enabled: true },
    { skill_id: "s2", enabled: true },
    { skill_id: "s3", enabled: true },
    { skill_id: "s4", enabled: false },
  ];

  it("moves an enabled skill up by one", () => {
    expect(moveSkill(items, "s3", -1).map((i) => i.skill_id)).toEqual(["s1", "s3", "s2", "s4"]);
  });

  it("clamps at the edges of the enabled list", () => {
    expect(moveSkill(items, "s1", -1)).toEqual(items);
    expect(moveSkill(items, "s3", 1)).toEqual(items);
  });

  it("never moves a disabled link", () => {
    expect(moveSkill(items, "s4", -1)).toEqual(items);
  });

  it("drops a dragged skill at the position of the target", () => {
    expect(reorderSkill(items, "s1", "s3").map((i) => i.skill_id)).toEqual(["s2", "s3", "s1", "s4"]);
    expect(reorderSkill(items, "s3", "s1").map((i) => i.skill_id)).toEqual(["s3", "s1", "s2", "s4"]);
  });

  it("ignores drops onto or from non-enabled rows", () => {
    expect(reorderSkill(items, "s1", "s4")).toEqual(items);
    expect(reorderSkill(items, "s4", "s1")).toEqual(items);
  });
});

describe("toPayload", () => {
  it("sends enabled links in order, then linked-but-disabled ones", () => {
    const items = [
      { skill_id: "s2", enabled: false },
      { skill_id: "s1", enabled: true },
    ];
    expect(toPayload(items)).toEqual({
      items: [
        { skill_id: "s1", enabled: true },
        { skill_id: "s2", enabled: false },
      ],
    });
  });
});

describe("filterRows / countEffective", () => {
  const rows = buildRows(SKILLS, [
    { skill_id: "s1", enabled: true },
    { skill_id: "s4", enabled: true },
  ]);

  it("filters by name, case-insensitively", () => {
    expect(filterRows(rows, "ALPHA").map((r) => r.skill.name)).toEqual(["alpha-guard"]);
    expect(filterRows(rows, "  ")).toHaveLength(rows.length);
  });

  it("counts only skills that reach the prompt (per-agent AND global enabled)", () => {
    expect(countEffective(rows)).toBe(1);
  });
});
