import { describe, it, expect } from "vitest";
import { NAV, SHORTCUTS } from "./nav";

const section = (name: string) => NAV.find((g) => g.section === name);

describe("NAV (L02 req 6)", () => {
  it("puts Skills and Agents in the SKILLS LAB section", () => {
    const lab = section("SKILLS LAB");
    expect(lab?.items.map((i) => i.key).slice(0, 2)).toEqual(["skills", "agents"]);
    expect(lab?.items.find((i) => i.key === "skills")?.href).toBe("/skills");
    expect(lab?.items.find((i) => i.key === "agents")?.href).toBe("/agents");
  });

  it("no longer lists Agents under WORKSPACE", () => {
    expect(section("WORKSPACE")?.items.map((i) => i.key)).not.toContain("agents");
  });

  it("keeps unique g-shortcuts, including g s for Skills", () => {
    const keys = NAV.flatMap((g) => g.items).map((i) => i.gKey).filter(Boolean);
    expect(new Set(keys).size).toBe(keys.length);
    expect(NAV.flatMap((g) => g.items).find((i) => i.key === "skills")?.gKey).toBe("s");
    expect(SHORTCUTS.some((s) => s.keys === "g s")).toBe(true);
  });
});

describe("NAV (L03 req 44)", () => {
  it("lists Conventions in SKILLS LAB after Agents, linking to /conventions", () => {
    const lab = section("SKILLS LAB");
    expect(lab?.items.map((i) => i.key)).toEqual(["skills", "agents", "conventions"]);
    const item = lab?.items.find((i) => i.key === "conventions");
    expect(item?.label).toBe("Conventions");
    expect(item?.href).toBe("/conventions");
    expect(item?.icon).toBe("ListChecks");
  });

  it("does not list Conventions under WORKSPACE", () => {
    expect(section("WORKSPACE")?.items.map((i) => i.key)).not.toContain("conventions");
  });

  it("registers the g c shortcut for Conventions", () => {
    expect(NAV.flatMap((g) => g.items).find((i) => i.key === "conventions")?.gKey).toBe("c");
    expect(SHORTCUTS.some((s) => s.keys === "g c")).toBe(true);
  });
});

describe("NAV (L05b req AC-46)", () => {
  it("AC-46: WORKSPACE = [pulls, onboarding-tour] with label, href '/repos/:repoId/onboarding', gKey 'o'", () => {
    const ws = section("WORKSPACE");
    expect(ws?.items.map((i) => i.key)).toEqual(["pulls", "onboarding-tour"]);
    const item = ws?.items.find((i) => i.key === "onboarding-tour");
    expect(item?.label).toBe("Onboarding Tour");
    expect(item?.href).toBe("/repos/:repoId/onboarding");
    expect(item?.gKey).toBe("o");
  });

  it("AC-46: SHORTCUTS has 'g o'; g-keys stay unique", () => {
    const sc = SHORTCUTS.find((s) => s.keys === "g o");
    expect(sc).toEqual({ keys: "g o", label: "Go to Onboarding Tour", group: "Navigation" });
    const keys = NAV.flatMap((g) => g.items).map((i) => i.gKey).filter(Boolean);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
