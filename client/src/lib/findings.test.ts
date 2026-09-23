import { describe, it, expect } from "vitest";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import { countBySeverity, latestPerAgent, prSeverityCounts, sortBySeverity, isSeverityLevel } from "./findings";

function finding(o: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f",
    severity: "WARNING",
    category: "bug",
    title: "t",
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "rv",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}
function review(o: Partial<ReviewRecord>): ReviewRecord {
  return {
    id: "rv",
    pr_id: "pr",
    agent_id: "A",
    run_id: null,
    kind: "review",
    verdict: null,
    summary: null,
    score: null,
    model: null,
    created_at: "2026-06-01T00:00:00.000Z",
    cost_usd: null,
    findings: [],
    ...o,
  };
}

describe("findings rule (client twin of the server rule)", () => {
  it("latestPerAgent keeps the newest review per agent and ignores summaries", () => {
    const picked = latestPerAgent([
      review({ id: "a-old", agent_id: "A", created_at: "2026-06-01T00:00:00Z" }),
      review({ id: "a-new", agent_id: "A", created_at: "2026-06-03T00:00:00Z" }),
      review({ id: "b", agent_id: "B", created_at: "2026-06-02T00:00:00Z" }),
      review({ id: "sum", agent_id: "B", kind: "summary", created_at: "2026-06-09T00:00:00Z" }),
    ]);
    expect(picked.map((r) => r.id).sort()).toEqual(["a-new", "b"]);
  });

  it("prSeverityCounts: newest per agent, dismissed excluded; null when never reviewed", () => {
    const reviews = [
      review({ id: "a-old", agent_id: "A", created_at: "2026-06-01T00:00:00Z", findings: [finding({ severity: "CRITICAL" })] }),
      review({
        id: "a-new",
        agent_id: "A",
        created_at: "2026-06-03T00:00:00Z",
        findings: [finding({ severity: "CRITICAL" }), finding({ severity: "WARNING", dismissed_at: "2026-06-04T00:00:00Z" })],
      }),
      review({ id: "b", agent_id: "B", created_at: "2026-06-02T00:00:00Z", findings: [finding({ severity: "SUGGESTION" }), finding({ severity: "SUGGESTION" })] }),
    ];
    expect(prSeverityCounts(reviews)).toEqual({ critical: 1, warning: 0, suggestion: 2 });
    expect(prSeverityCounts([])).toBeNull();
    expect(prSeverityCounts([review({ findings: [] })])).toEqual({ critical: 0, warning: 0, suggestion: 0 });
  });

  it("countBySeverity ignores INFO; sortBySeverity orders critical first without mutating", () => {
    const rows = [finding({ severity: "SUGGESTION" }), finding({ severity: "INFO" as FindingRecord["severity"] }), finding({ severity: "CRITICAL" })];
    expect(countBySeverity(rows)).toEqual({ critical: 1, warning: 0, suggestion: 1 });
    const sorted = sortBySeverity(rows);
    expect(sorted.map((r) => r.severity)).toEqual(["CRITICAL", "SUGGESTION", "INFO"]);
    expect(rows[0]!.severity).toBe("SUGGESTION");
  });

  it("isSeverityLevel validates URL input", () => {
    expect(isSeverityLevel("CRITICAL")).toBe(true);
    expect(isSeverityLevel("critical")).toBe(false);
    expect(isSeverityLevel(null)).toBe(false);
  });
});
