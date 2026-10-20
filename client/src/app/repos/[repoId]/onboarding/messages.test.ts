import { describe, it, expect } from "vitest";
import en from "../../../../../messages/en/onboarding.json";

const AC41_CODES = [
  "no_clone",
  "index_degraded",
  "index_partial",
  "no_graph",
  "llm_timeout",
  "llm_error",
  "invalid_output",
  "no_api_key",
  "budget_trimmed",
  "interrupted",
] as const;

describe("onboarding messages (NFR-8)", () => {
  it("NFR-8: the stale `generate.body` key is gone", () => {
    expect(en).not.toHaveProperty("generate.body");
    expect(en).toHaveProperty("actions.generate", "Generate onboarding tour");
    expect(en).toHaveProperty("actions.generateNote", "Makes one model call");
    expect(en).toHaveProperty("actions.lastFailed", "Last generation failed: {reason}");
  });

  it("NFR-8: reasons has a label for every AC-41 code (10)", () => {
    const reasons = (en as unknown as { reasons: Record<string, string> }).reasons;
    expect(Object.keys(reasons).sort()).toEqual([...AC41_CODES].sort());
    for (const code of AC41_CODES) expect(reasons[code]).toMatch(/\S/);
    expect(reasons.llm_timeout).toBe("Model timed out");
    expect(reasons.interrupted).toBe("Interrupted");
    expect(reasons.index_degraded).toBe("Index unavailable");
  });

  it("NFR-8: sections has the five titles in spec order", () => {
    const sections = (en as unknown as { sections: Record<string, string> }).sections;
    expect(Object.keys(sections)).toEqual([
      "architecture",
      "criticalPaths",
      "runCommands",
      "readingPath",
      "firstTasks",
    ]);
    expect(Object.values(sections)).toEqual([
      "Architecture overview",
      "Critical paths",
      "How to run locally",
      "Guided reading path",
      "First tasks",
    ]);
  });

  it("NFR-8: indexStatus covers full, partial, degraded, notIndexed, failed, loading and unknown; notCloned has requested, stillCloning and failed", () => {
    const m = en as unknown as {
      indexStatus: Record<string, string>;
      notCloned: Record<string, string>;
    };
    expect(m.indexStatus).toEqual({
      full: "indexed",
      partial: "partially indexed",
      degraded: "degraded",
      notIndexed: "not indexed",
      failed: "index failed",
      loading: "checking…",
      unknown: "unavailable",
    });
    expect(m.notCloned.requested).toBe("Clone requested — this page updates when it finishes");
    expect(m.notCloned.stillCloning).toBe("Still cloning — refresh the page to check");
    expect(m.notCloned.failed).toBe("Couldn't start the clone — try again");
    expect(m.notCloned.cta).toBe("Clone and index");
    expect(m.notCloned.index).toBe("Index status: {status}");
  });

  it("NFR-8: header, copy, stale and card keys carry the spec wording", () => {
    expect(en).toHaveProperty("title", "Onboarding for {name}");
    expect(en).toHaveProperty("breadcrumb", "Onboarding Tour");
    expect(en).toHaveProperty("subtitle.coverage", "Generated from index of {count} files");
    expect(en).toHaveProperty("copy.failed", "Couldn't copy to the clipboard");
    expect(en).toHaveProperty("stale.index_moved", "Index moved since this tour");
    expect(en).toHaveProperty("card.deterministic", "Deterministic");
    expect(en).toHaveProperty("toc.title", "On this page");
    expect(en).toHaveProperty("loadError.retry", "Retry");
  });
});
