import { describe, it, expect } from "vitest";
import type { FindingRecord, PrFile, SmartDiffResponse } from "@devdigest/shared";
import { COLLAPSED_ROLES } from "./constants";
import { filesWithFindings, findingKey, joinGroups, lineLabelKey, totals, parseLineParam, resolveTarget } from "./helpers";

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

describe("parseLineParam", () => {
  it("AC-57 / security: only a positive integer is a line; anything else is ignored", () => {
    expect(parseLineParam("7")).toBe(7);
    expect(parseLineParam("0")).toBeNull();
    expect(parseLineParam("-3")).toBeNull();
    expect(parseLineParam("x")).toBeNull();
    expect(parseLineParam("7.5")).toBeNull();
    expect(parseLineParam("")).toBeNull();
    expect(parseLineParam(null)).toBeNull();
  });
});

describe("resolveTarget", () => {
  const patched = (path: string, p: string | null): PrFile =>
    ({ path, status: "modified", additions: 3, deletions: 0, patch: p }) as PrFile;
  const files = [
    patched("src/config.ts", ["@@ -10,2 +10,3 @@", " a", " b", "+c"].join("\n")),
    patched("src/big.bin", null),
  ];

  it("none: no file param", () => {
    expect(resolveTarget(files, null, null).status).toBe("none");
    expect(resolveTarget(files, null, 5).status).toBe("none");
  });

  it("AC-59: not_in_diff: the file is not among the PR files", () => {
    expect(resolveTarget(files, "src/nope.ts", 3).status).toBe("not_in_diff");
  });

  it("AC-57 / AC-58: ok: the file, with no line or with a rendered line", () => {
    expect(resolveTarget(files, "src/config.ts", null)).toMatchObject({ status: "ok", path: "src/config.ts" });
    expect(resolveTarget(files, "src/config.ts", 12)).toMatchObject({ status: "ok", path: "src/config.ts" });
    expect(resolveTarget(files, "src/big.bin", null)).toMatchObject({ status: "ok", path: "src/big.bin" });
  });

  it("AC-60: line_not_shown: patch null, or a line outside every hunk", () => {
    expect(resolveTarget(files, "src/big.bin", 5)).toMatchObject({ status: "line_not_shown", path: "src/big.bin" });
    expect(resolveTarget(files, "src/config.ts", 999)).toMatchObject({ status: "line_not_shown", path: "src/config.ts" });
  });
});
