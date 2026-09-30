import { describe, it, expect } from "vitest";
import { diffLines, diffStats } from "./skill-diff";

describe("diffLines", () => {
  it("returns only unchanged lines for identical text", () => {
    expect(diffLines("a\nb", "a\nb")).toEqual([
      { kind: "same", text: "a" },
      { kind: "same", text: "b" },
    ]);
  });

  it("marks lines only in the new text as added and only in the old text as removed", () => {
    expect(diffLines("a\nb\nc", "a\nc\nd")).toEqual([
      { kind: "same", text: "a" },
      { kind: "del", text: "b" },
      { kind: "same", text: "c" },
      { kind: "add", text: "d" },
    ]);
  });

  it("handles an empty old text (everything added)", () => {
    expect(diffLines("", "x\ny")).toEqual([
      { kind: "add", text: "x" },
      { kind: "add", text: "y" },
    ]);
  });

  it("keeps the longest common subsequence in order", () => {
    const out = diffLines("# Rule\nold line\nkeep", "# Rule\nnew line\nkeep\nextra");
    expect(out.map((l) => `${l.kind}:${l.text}`)).toEqual([
      "same:# Rule",
      "del:old line",
      "add:new line",
      "same:keep",
      "add:extra",
    ]);
  });

  it("normalises CRLF line endings", () => {
    expect(diffLines("a\r\nb", "a\nb").every((l) => l.kind === "same")).toBe(true);
  });
});

describe("diffStats", () => {
  it("counts added and removed lines", () => {
    expect(diffStats(diffLines("a\nb\nc", "a\nc\nd\ne"))).toEqual({ added: 2, removed: 1 });
  });
});
