/**
 * RunHistory — the badge must reflect the review OUTCOME, not the run lifecycle.
 * Regression guard for the "green ✓ done on a run that found 5 blockers" bug:
 * a settled run is colored/labelled by its denormalized blocker/finding counts,
 * and shows the review score ring.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunSummary, ReviewRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { RunHistory } from "./RunHistory";

afterEach(cleanup);

function run(o: Partial<RunSummary>): RunSummary {
  return {
    run_id: "run-1",
    agent_id: "a1",
    agent_name: "Security Reviewer",
    provider: "openrouter",
    model: "deepseek/deepseek-v4-flash",
    status: "done",
    error: null,
    duration_ms: 1000,
    tokens_in: 100,
    tokens_out: 50,
    findings_count: 0,
    grounding: "0/0 passed",
    ran_at: "2026-06-11T18:44:34.000Z",
    score: null,
    blockers: null,
    cost_usd: null,
    ...o,
  };
}

function renderRuns(runs: RunSummary[], reviewsByRunId?: Map<string, ReviewRecord>) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <RunHistory runs={runs} reviewsByRunId={reviewsByRunId} onOpenTrace={() => {}} />
    </NextIntlClientProvider>,
  );
}

function reviewFor(runId: string, severities: string[]): ReviewRecord {
  return {
    id: `rv-${runId}`,
    pr_id: "pr1",
    agent_id: "a1",
    run_id: runId,
    agent_name: "Security Reviewer",
    kind: "review",
    verdict: "request_changes",
    summary: null,
    score: 38,
    model: "m",
    grounding: null,
    created_at: "2026-06-11T18:44:34.000Z",
    cost_usd: null,
    findings: severities.map((severity, i) => ({
      id: `f${i}`,
      severity: severity as ReviewRecord["findings"][number]["severity"],
      category: "security",
      title: `Finding ${i}`,
      file: "src/config.ts",
      start_line: 12,
      end_line: 12,
      rationale: "r",
      suggestion: null,
      confidence: 0.9,
      kind: "finding",
      trifecta_components: null,
      evidence: null,
      review_id: `rv-${runId}`,
      accepted_at: null,
      dismissed_at: i === severities.length - 1 && severities.length > 2 ? "2026-06-12T00:00:00.000Z" : null,
    })),
  };
}

describe("RunHistory — outcome badge", () => {
  it("a done run WITH blockers reads 'rejected' (never green 'done') + shows the score ring", () => {
    renderRuns([run({ status: "done", findings_count: 5, blockers: 5, score: 0 })]);
    expect(screen.getByText("rejected")).toBeInTheDocument();
    expect(screen.queryByText("done")).not.toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument(); // CircularScore renders the number
    expect(screen.getByText(/5 blockers/)).toBeInTheDocument();
  });

  it("a clean done run reads 'approved'", () => {
    renderRuns([run({ status: "done", findings_count: 0, blockers: 0, score: 95 })]);
    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.getByText("95")).toBeInTheDocument();
  });

  it("a done run with non-blocking findings reads 'reviewed'", () => {
    renderRuns([run({ status: "done", findings_count: 3, blockers: 0, score: 72 })]);
    expect(screen.getByText("reviewed")).toBeInTheDocument();
    expect(screen.queryByText(/blockers/)).not.toBeInTheDocument();
  });

  it("a failed run reads 'error'", () => {
    renderRuns([run({ status: "failed", error: "boom", score: null, blockers: null })]);
    expect(screen.getByText("error")).toBeInTheDocument();
  });

  it("a running run reads 'running'", () => {
    renderRuns([run({ status: "running", score: null, blockers: null })]);
    expect(screen.getByText("running")).toBeInTheDocument();
  });

  it("L01: shows the run cost under the time when known", () => {
    renderRuns([run({ cost_usd: 0.0042 })]);
    expect(screen.getByText("$0.0042")).toBeInTheDocument();
  });

  it("L01: shows no cost element when the cost is unknown", () => {
    renderRuns([run({ cost_usd: null })]);
    expect(screen.queryByText(/^\$/)).toBeNull();
  });

  it("L01: a settled run shows its own severity counters (dismissed excluded) with a hover preview", () => {
    const review = reviewFor("run-1", ["CRITICAL", "CRITICAL", "WARNING", "SUGGESTION"]); // last one dismissed
    renderRuns([run({ findings_count: 4, score: 38 })], new Map([["run-1", review]]));
    expect(screen.getByLabelText("2 critical findings")).toBeInTheDocument();
    expect(screen.getByLabelText("1 warning finding")).toBeInTheDocument();
    expect(screen.queryByLabelText(/suggestion/)).toBeNull();
  });

  it("L01: without a matching review the row falls back to the findings count text", () => {
    renderRuns([run({ findings_count: 3, score: 60 })]);
    expect(screen.getByText("3 finding(s)")).toBeInTheDocument();
  });
});
