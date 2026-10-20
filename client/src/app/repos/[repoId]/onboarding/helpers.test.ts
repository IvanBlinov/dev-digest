import { describe, it, expect } from "vitest";
import type { OnboardingDiagram, OnboardingReason } from "@devdigest/shared";
import {
  TOUR_SECTIONS,
  diagramToMermaid,
  fileHref,
  isTourAnchor,
  tourToMarkdown,
  tourViewMode,
} from "./helpers";
import { REPO, tour, tourState } from "./test-fixtures";

const ANCHORS = [
  "architecture-overview",
  "critical-paths",
  "how-to-run-locally",
  "guided-reading-path",
  "first-tasks",
];
const TITLE_BY_ANCHOR: Record<string, string> = {
  "architecture-overview": "Architecture overview",
  "critical-paths": "Critical paths",
  "how-to-run-locally": "How to run locally",
  "guided-reading-path": "Guided reading path",
  "first-tasks": "First tasks",
};

/** `titles` is keyed by TOUR_SECTIONS[i].key. */
const TITLES = Object.fromEntries(TOUR_SECTIONS.map((s) => [s.key, TITLE_BY_ANCHOR[s.anchor]!]));
const reasonLabel = (r: OnboardingReason) => `label-${r}`;

function mode(data: ReturnType<typeof tourState> | undefined, over: Partial<Parameters<typeof tourViewMode>[0]> = {}) {
  return tourViewMode({ repoKnown: true, isLoading: false, isError: false, data, ...over });
}

describe("TOUR_SECTIONS / isTourAnchor", () => {
  it("AC-55: TOUR_SECTIONS lists the five sections in spec order", () => {
    expect(TOUR_SECTIONS.map((s) => s.anchor)).toEqual(ANCHORS);
  });

  it("AC-55: isTourAnchor accepts the five anchors only ('#evil', '', '#Architecture-overview' → null)", () => {
    for (const a of ANCHORS) expect(isTourAnchor(`#${a}`)).toBe(a);
    expect(isTourAnchor("#evil")).toBeNull();
    expect(isTourAnchor("")).toBeNull();
    expect(isTourAnchor("#Architecture-overview")).toBeNull();
  });
});

describe("tourViewMode", () => {
  it("AC-50: cloned false + tour null → not_cloned", () => {
    expect(mode(tourState({ cloned: false, status: "none", tour: null }))).toBe("not_cloned");
  });

  it("AC-51: cloned false + tour → tour", () => {
    expect(mode(tourState({ cloned: false }))).toBe("tour");
  });

  it("AC-52: none + cloned → empty", () => {
    expect(mode(tourState({ status: "none", tour: null }))).toBe("empty");
  });

  it("AC-53: generating → generating, even with a stored tour", () => {
    expect(mode(tourState({ status: "generating" }))).toBe("generating");
    expect(mode(tourState({ status: "generating", tour: null }))).toBe("generating");
  });

  it("AC-68: isError → load_error", () => {
    expect(mode(undefined, { isError: true })).toBe("load_error");
  });

  it("EC-1: repo unknown → no_repo", () => {
    expect(mode(undefined, { repoKnown: false })).toBe("no_repo");
  });

  it("isLoading → loading", () => {
    expect(mode(undefined, { isLoading: true })).toBe("loading");
  });

  it("Q1: failed + tour null + cloned → empty", () => {
    expect(mode(tourState({ status: "failed", tour: null, last_error: { reason: "interrupted", at: "2026-10-19T10:00:00.000Z" } }))).toBe("empty");
  });

  it("AC-58: failed + tour → tour", () => {
    expect(mode(tourState({ status: "failed", last_error: { reason: "llm_timeout", at: "2026-10-19T10:00:00.000Z" } }))).toBe("tour");
  });
});

describe("fileHref", () => {
  it("AC-60: fileHref uses index_sha, else default_branch, and encodes segments", () => {
    expect(fileHref(REPO, null, "src/a b/c#.ts")).toBe("https://github.com/acme/payments-api/blob/main/src/a%20b/c%23.ts");
    expect(fileHref(REPO, "abc123", "src/config.ts")).toBe("https://github.com/acme/payments-api/blob/abc123/src/config.ts");
  });
});

describe("diagramToMermaid", () => {
  const diagram: OnboardingDiagram = {
    nodes: [
      { id: "module:api", label: "api", kind: "module" },
      { id: "module:db", label: "db", kind: "service" },
    ],
    edges: [
      { from: "module:api", to: "module:db" },
      { from: "module:api", to: "ghost" },
    ],
  };

  it("AC-28: diagramToMermaid → `graph LR`, ids n0…, quoted labels; service nodes use `[(…)]`; edges to unknown ids are dropped", () => {
    const out = diagramToMermaid(diagram);
    expect(out.trimStart().startsWith("graph LR")).toBe(true);
    expect(out).toContain('n0["api"]');
    expect(out).toMatch(/n1\[\(\s*"db"\s*\)\]/);
    expect(out).toContain("n0 --> n1");
    expect(out.match(/-->/g)).toHaveLength(1);
    expect(out).not.toContain("module:api");
    expect(out).not.toContain("ghost");
  });

  it('AC-28: a label `x"]; click n0 evil` is sanitized (no quote, bracket or semicolon survives)', () => {
    const out = diagramToMermaid({
      nodes: [{ id: "a", label: 'x"]; click n0 evil', kind: "module" }],
      edges: [],
    });
    expect(out).not.toContain('x"]');
    expect(out).not.toContain(";");
    const nodeLine = out.split("\n").find((l) => l.includes("n0["))!;
    expect(nodeLine.match(/"/g)).toHaveLength(2);
    expect(nodeLine).not.toMatch(/\]\s*\S/);
  });
});

describe("tourToMarkdown", () => {
  const md = tourToMarkdown(tour(), { repoName: "payments-api", titles: TITLES, reasonLabel });

  it("AC-65: starts with `# Onboarding for payments-api` and has five `## ` headings in order", () => {
    expect(md.startsWith("# Onboarding for payments-api")).toBe(true);
    const h2 = md.split("\n").filter((l) => l.startsWith("## "));
    expect(h2).toEqual(ANCHORS.map((a) => `## ${TITLE_BY_ANCHOR[a]}`));
  });

  it("AC-65: paths in backticks; one `sh` block with the commands in order (comment as ` # …`)", () => {
    expect(md).toContain("`src/middleware/ratelimit.ts`");
    expect(md).toContain("`src/config.ts`");
    expect(md.match(/```sh/g)).toHaveLength(1);
    const block = /```sh\n([\s\S]*?)```/.exec(md)![1]!.trim().split("\n");
    expect(block).toEqual([
      "pnpm install # Install dependencies",
      "pnpm run dev # Start the API locally",
      "pnpm run test # Run the unit tests",
    ]);
  });

  it("AC-65: tasks as `- **title** — description (`path`)`", () => {
    expect(md).toContain(
      "- **Document the rate limit headers** — Describe the headers the limiter sets in docs/rate-limiting.md. (`src/middleware/ratelimit.ts`)",
    );
  });

  it("AC-65: an unavailable section → `_Unavailable: <label>_`", () => {
    const base = tour();
    const out = tourToMarkdown(
      tour({
        sections: {
          ...base.sections,
          critical_paths: { source: "deterministic", unavailable_reason: "index_degraded", items: [] },
        },
      }),
      { repoName: "payments-api", titles: TITLES, reasonLabel },
    );
    expect(out).toContain("_Unavailable: label-index_degraded_");
  });
});
