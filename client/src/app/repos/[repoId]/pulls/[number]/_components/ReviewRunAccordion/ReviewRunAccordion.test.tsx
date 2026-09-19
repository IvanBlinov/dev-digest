/**
 * ReviewRunAccordion header — L01: shows the run's cost next to the time when
 * known, and nothing (no "—") when the cost is unknown.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { ReviewRecord } from "@devdigest/shared";

vi.mock("../../../../../../../lib/hooks/reviews", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useDeleteReview: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { ReviewRunAccordion } from "./ReviewRunAccordion";

afterEach(cleanup);

function review(o: Partial<ReviewRecord>): ReviewRecord {
  return {
    id: "rv1",
    pr_id: "pr1",
    agent_id: "a1",
    run_id: "run1",
    agent_name: "General Reviewer",
    kind: "review",
    verdict: "request_changes",
    summary: "needs work",
    score: 65,
    model: "gpt-4.1",
    grounding: "1/2 passed",
    created_at: "2026-06-11T18:44:34.000Z",
    cost_usd: null,
    findings: [],
    ...o,
  };
}

describe("ReviewRunAccordion — cost in header (L01)", () => {
  it("shows the run cost when known", () => {
    render(<ReviewRunAccordion review={review({ cost_usd: 0.0042 })} prId="pr1" />);
    expect(screen.getByText("$0.0042")).toBeInTheDocument();
  });
  it("shows no cost element when unknown", () => {
    render(<ReviewRunAccordion review={review({ cost_usd: null })} prId="pr1" />);
    expect(screen.queryByText(/^\$/)).toBeNull();
    expect(screen.queryByText("—")).toBeNull();
  });

  it("L01: header shows severity counters of the run's active findings and calls the filter", () => {
    const onSelectSeverity = vi.fn();
    const rv = review({
      cost_usd: null,
      findings: [
        { id: "f1", severity: "CRITICAL", category: "security", title: "A", file: "a.ts", start_line: 1, end_line: 1, rationale: "r", suggestion: null, confidence: 0.9, kind: "finding", trifecta_components: null, evidence: null, review_id: "rv1", accepted_at: null, dismissed_at: null },
        { id: "f2", severity: "WARNING", category: "bug", title: "B", file: "a.ts", start_line: 2, end_line: 2, rationale: "r", suggestion: null, confidence: 0.9, kind: "finding", trifecta_components: null, evidence: null, review_id: "rv1", accepted_at: null, dismissed_at: "2026-06-12T00:00:00.000Z" },
      ],
    });
    render(<ReviewRunAccordion review={rv} prId="pr1" onSelectSeverity={onSelectSeverity} />);
    fireEvent.click(screen.getByLabelText("1 critical finding, filter"));
    expect(onSelectSeverity).toHaveBeenCalledWith("CRITICAL");
    expect(screen.queryByLabelText(/warning/)).toBeNull(); // dismissed
    expect(screen.getByText("1 blocker")).toBeInTheDocument();
  });
});
