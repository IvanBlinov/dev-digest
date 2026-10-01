import { describe, it, expect } from "vitest";
import { SkillName, SkillType, SKILL_BODY_MAX as CONTRACT_BODY_MAX, type Skill } from "@devdigest/shared";
import {
  estimateTokens,
  skillNameError,
  filterSkills,
  importKind,
  readFileAsBase64,
  isSkillBlocked,
  SKILL_TYPES,
  SKILL_BODY_MAX,
} from "./skill-helpers";

const skill = (over: Partial<Skill>): Skill => ({
  id: "s",
  name: "x",
  description: "",
  type: "custom",
  source: "manual",
  body: "",
  enabled: true,
  version: 1,
  ...over,
});

describe("estimateTokens", () => {
  it("is ceil(length / 4)", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });
});

describe("skillNameError", () => {
  it("accepts kebab-case slugs", () => {
    expect(skillNameError("api-contract-guard")).toBeNull();
    expect(skillNameError("a1")).toBeNull();
  });
  it("flags an empty name as required", () => {
    expect(skillNameError("  ")).toBe("required");
  });
  it("flags bad characters and bad lengths as invalid", () => {
    expect(skillNameError("Api Guard")).toBe("invalid");
    expect(skillNameError("-lead")).toBe("invalid");
    expect(skillNameError("a")).toBe("invalid");
    expect(skillNameError("a".repeat(65))).toBe("invalid");
  });
});

describe("filterSkills", () => {
  const list = [
    skill({ id: "1", name: "api-contract-guard", description: "Breaking route changes" }),
    skill({ id: "2", name: "test-quality", description: "Edge cases and branches" }),
  ];
  it("returns all for an empty query", () => {
    expect(filterSkills(list, " ")).toHaveLength(2);
  });
  it("matches name or description case-insensitively", () => {
    expect(filterSkills(list, "API").map((s) => s.id)).toEqual(["1"]);
    expect(filterSkills(list, "edge").map((s) => s.id)).toEqual(["2"]);
  });
});

describe("importKind", () => {
  it("accepts .md and .zip (any case) and rejects everything else", () => {
    expect(importKind("SKILL.md")).toBe("md");
    expect(importKind("bundle.ZIP")).toBe("zip");
    expect(importKind("x.tar.gz")).toBeNull();
    expect(importKind("notes.txt")).toBeNull();
    expect(importKind("md")).toBeNull();
  });
});

describe("readFileAsBase64", () => {
  it("returns the file content base64-encoded without a data: prefix", async () => {
    const file = new File(["# Hi"], "a.md", { type: "text/markdown" });
    expect(await readFileAsBase64(file)).toBe(btoa("# Hi"));
  });
});

describe("contract parity (runtime values are mirrored, see skill-helpers.ts)", () => {
  it("SKILL_TYPES lists every contract skill type", () => {
    expect(SKILL_TYPES).toEqual(SkillType.options);
  });
  it("SKILL_BODY_MAX matches the contract", () => {
    expect(SKILL_BODY_MAX).toBe(CONTRACT_BODY_MAX);
  });
  it("skillNameError agrees with the SkillName schema", () => {
    for (const n of ["ab", "a", "a-b-c", "A-b", "-x", "x_y", "a".repeat(64), "a".repeat(65), "9lives"]) {
      expect(skillNameError(n) === null, n).toBe(SkillName.safeParse(n).success);
    }
  });
});

describe("isSkillBlocked", () => {
  const finding = { rule: "ignore-instructions", label: "Overrides instructions", severity: "high" as const, line: 3, excerpt: "ignore all previous instructions" };

  it("is true only when the scan status is blocked", () => {
    expect(isSkillBlocked({ status: "blocked", findings: [finding] })).toBe(true);
    expect(isSkillBlocked({ status: "clean", findings: [] })).toBe(false);
  });

  it("treats a missing scan as clean", () => {
    expect(isSkillBlocked(undefined)).toBe(false);
    expect(isSkillBlocked(null)).toBe(false);
  });
});
