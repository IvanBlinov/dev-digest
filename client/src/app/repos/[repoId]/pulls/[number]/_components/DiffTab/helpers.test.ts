import { describe, it, expect } from "vitest";
import type { FindingRecord, PrFile, SmartDiffResponse } from "@devdigest/shared";
import { COLLAPSED_ROLES } from "./constants";
import { filesWithFindings, findingKey, joinGroups, lineLabelKey, totals } from "./helpers";

const file = (path: string, additions = 1, deletions = 0): PrFile =>
  ({ path, status: "modified", additions, deletions, patch: null }) as PrFile;

const finding = (path: string, line: number): Pick<FindingRecord, "file" | "start_line"> => ({
  file: path,
  start_line: line,
});

const smart = (groups: SmartDiffResponse["groups"]): SmartDiffResponse => ({
  groups,
  split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] },
});

const sd = (path: string) => ({ path, additions: 1, deletions: 0, finding_lines: [] });

describe("joinGroups", () => {
  it("maps server groups to PrFiles in server order and drops empty groups", () => {
    const files = [file("a.ts"), file("b.test.ts"), file("c.md")];
    const out = joinGroups(
      smart([
        { role: "core", files: [sd("a.ts")] },
        { role: "tests", files: [sd("b.test.ts")] },
        { role: "docs", files: [sd("gone.md")] },
      ]),
      files,
    );
    expect(out.map((g) => [g.role, g.files.map((f) => f.path)])).toEqual([
      ["core", ["a.ts", "c.md"]],
      ["tests", ["b.test.ts"]],
    ]);
  });

  it("creates a leading core group when a PR file is unknown to smart-diff", () => {
    const out = joinGroups(smart([{ role: "docs", files: [sd("r.md")] }]), [file("r.md"), file("x.ts")]);
    expect(out.map((g) => g.role)).toEqual(["core", "docs"]);
    expect(out[0]!.files.map((f) => f.path)).toEqual(["x.ts"]);
  });
});

describe("finding helpers", () => {
  it("filesWithFindings counts files, not findings", () => {
    const files = [file("a.ts"), file("b.ts"), file("c.ts")];
    expect(
      filesWithFindings(files, [finding("a.ts", 1), finding("a.ts", 2), finding("b.ts", 3), finding("zzz.ts", 1)]),
    ).toBe(2);
  });

  it("lineLabelKey maps severities, INFO has none", () => {
    expect(lineLabelKey("CRITICAL")).toBe("blocker");
    expect(lineLabelKey("WARNING")).toBe("warning");
    expect(lineLabelKey("SUGGESTION")).toBe("suggestion");
    expect(lineLabelKey("INFO")).toBeNull();
  });

  it("findingKey anchors on the new-side start line", () => {
    expect(findingKey(finding("a.ts", 12))).toBe("RIGHT:12");
  });
});

describe("totals + constants", () => {
  it("sums files, additions, deletions", () => {
    expect(totals([file("a", 3, 1), file("b", 2, 0)])).toEqual({ files: 2, additions: 5, deletions: 1 });
  });
  it("collapses docs and boilerplate by default", () => {
    expect([...COLLAPSED_ROLES].sort()).toEqual(["boilerplate", "docs"]);
  });
});
