import { describe, it, expect } from "vitest";
import { markerForLine, partitionAnnotations, type LineAnnotation } from "./annotations";
import type { Line } from "./helpers";

function ann(id: string, key: string, marker: LineAnnotation["marker"] = null): LineAnnotation {
  return { id, path: "src/a.ts", key, marker, node: null };
}

describe("partitionAnnotations", () => {
  it("anchors rendered keys, sends the rest outside, keeps input order", () => {
    const a = ann("a", "RIGHT:12");
    const b = ann("b", "RIGHT:12");
    const c = ann("c", "RIGHT:99");
    const { matched, outside } = partitionAnnotations([a, c, b], new Set(["RIGHT:12"]));
    expect(matched.get("RIGHT:12")).toEqual([a, b]);
    expect(outside).toEqual([c]);
  });
});

describe("markerForLine", () => {
  const line: Line = { kind: "add", text: "x", newNo: 12 };
  it("returns the first non-null marker among the line's keys", () => {
    const marker = { color: "red", label: "blocker" };
    const matched = new Map([["RIGHT:12", [ann("a", "RIGHT:12", null), ann("b", "RIGHT:12", marker)]]]);
    expect(markerForLine(line, matched)).toEqual(marker);
  });
  it("returns null when nothing is anchored", () => {
    expect(markerForLine(line, new Map())).toBeNull();
  });
});
