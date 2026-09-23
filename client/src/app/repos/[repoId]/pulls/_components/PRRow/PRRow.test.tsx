/**
 * PRRow — L01 cost column: renders the PR's total run cost, "—" when unknown.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrMeta } from "@/lib/types";
import messages from "../../../../../../../messages/en/prReview.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: () => ({ data: [], isLoading: false }),
  prefetchPrReviews: vi.fn(),
}));

import { PRRow } from "./PRRow";

afterEach(cleanup);

function pr(o: Partial<PrMeta>): PrMeta {
  return {
    id: "pr1",
    number: 482,
    title: "Add rate limiting to public API endpoints",
    author: "marisa.koch",
    branch: "feat/rl",
    base: "main",
    head_sha: "a1b2c3d4",
    additions: 40,
    deletions: 4,
    files_count: 3,
    status: "needs_review",
    opened_at: "2026-06-11T18:44:34.000Z",
    updated_at: "2026-06-11T18:44:34.000Z",
    score: null,
    ...o,
  } as PrMeta;
}

function renderRow(p: PrMeta) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <PRRow pr={p} repoId="r1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("PRRow — cost column (L01)", () => {
  it("shows the summed run cost in USD", () => {
    renderRow(pr({ cost_usd: 0.0123 }));
    expect(screen.getByText("$0.0123")).toBeInTheDocument();
  });
  it("shows an em dash when the cost is unknown", () => {
    renderRow(pr({ cost_usd: null, score: 65, findings: { critical: 1, warning: 0, suggestion: 0 } }));
    // Score and findings are present, so the only "—" on the row is the cost cell.
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("PRRow — findings column (L01)", () => {
  it("renders severity counters that link to the filtered PR page", () => {
    renderRow(pr({ cost_usd: 0.01, score: 65, findings: { critical: 2, warning: 0, suggestion: 4 } }));
    const crit = screen.getByLabelText("2 critical findings, filter");
    expect(crit).toHaveAttribute("href", "/repos/r1/pulls/482?tab=findings&severity=CRITICAL");
    fireEvent.click(crit);
    expect(push).toHaveBeenCalledWith("/repos/r1/pulls/482?tab=findings&severity=CRITICAL");
  });
  it("shows ✓ 0 for a reviewed-clean PR and — for a never-reviewed one", () => {
    renderRow(pr({ cost_usd: 0.01, score: 100, findings: { critical: 0, warning: 0, suggestion: 0 } }));
    expect(screen.getByLabelText("Reviewed, no active findings")).toBeInTheDocument();
    cleanup();
    renderRow(pr({ cost_usd: 0.01, score: 65, findings: null }));
    expect(screen.getByLabelText("Not reviewed yet")).toBeInTheDocument();
  });
});
