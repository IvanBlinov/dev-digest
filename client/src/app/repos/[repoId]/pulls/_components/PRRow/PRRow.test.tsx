/**
 * PRRow — L01 cost column: renders the PR's total run cost, "—" when unknown.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@/lib/types";
import messages from "../../../../../../../messages/en/prReview.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
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
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={p} repoId="r1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow — cost column (L01)", () => {
  it("shows the summed run cost in USD", () => {
    renderRow(pr({ cost_usd: 0.0123 }));
    expect(screen.getByText("$0.0123")).toBeInTheDocument();
  });
  it("shows an em dash when the cost is unknown", () => {
    renderRow(pr({ cost_usd: null, score: 65 }));
    // Score is present, so the only "—" on the row is the cost cell.
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
