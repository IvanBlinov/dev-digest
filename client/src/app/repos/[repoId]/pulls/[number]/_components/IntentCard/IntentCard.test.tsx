import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrIntentRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

const mocks = vi.hoisted(() => ({
  usePrIntent: vi.fn(),
  useDetectIntent: vi.fn(),
}));
vi.mock("@/lib/hooks/intent", () => mocks);

import { IntentCard } from "./IntentCard";

afterEach(cleanup);

const RECORD: PrIntentRecord = {
  pr_id: "p1",
  summary: "Add a token-bucket rate limiter to the public API",
  in_scope: ["rate limiter middleware"],
  out_of_scope: ["billing changes"],
  confidence: "low",
  sources: [
    { kind: "issue", ref: "#471", status: "ok" },
    { kind: "spec", ref: "specs/missing.md", status: "not_found" },
  ],
  missing_context: ["Could not read spec specs/missing.md (not_found)"],
  head_sha: "abc",
  provider: "openrouter",
  model: "openai/gpt-4.1-mini",
  prompt_version: "intent-v1",
  tokens_in: 1,
  tokens_out: 1,
  duration_ms: 1,
  cost_usd: 0.001,
  detected_at: "2026-10-08T00:00:00Z",
  stale: false,
  stale_reason: null,
};

const mutate = vi.fn();
const refetch = vi.fn();

function setup(query: Record<string, unknown>, pending = false) {
  mocks.usePrIntent.mockReturnValue({ data: undefined, isLoading: false, isError: false, refetch, ...query });
  mocks.useDetectIntent.mockReturnValue({ mutate, isPending: pending });
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <IntentCard prId="p1" />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("IntentCard", () => {
  it("shows a skeleton while loading", () => {
    setup({ isLoading: true });
    expect(screen.getByLabelText("Loading PR intent")).toBeInTheDocument();
  });

  it("empty state: Detect intent triggers detection", () => {
    setup({ data: { intent: null } });
    expect(screen.getByText("No intent detected yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Detect intent" }));
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("renders summary, both scope columns, confidence, sources and missing context", () => {
    setup({ data: { intent: RECORD } });
    expect(screen.getByText(/Add a token-bucket rate limiter/)).toBeInTheDocument();
    const inScope = screen.getByRole("region", { name: "In scope" });
    expect(within(inScope).getByText("rate limiter middleware")).toBeInTheDocument();
    const outScope = screen.getByRole("region", { name: "Out of scope" });
    expect(within(outScope).getByText("billing changes")).toBeInTheDocument();
    expect(screen.getByText("Low confidence")).toBeInTheDocument();
    expect(screen.getByText(/#471/)).toBeInTheDocument();
    expect(screen.getByText(/specs\/missing\.md/, { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("not found")).toBeInTheDocument();
    expect(screen.getByRole("note", { name: "Missing context" })).toHaveTextContent("Could not read spec");
    expect(screen.queryByText("Stale")).not.toBeInTheDocument();
  });

  it("stale: shows the badge and Re-detect intent triggers detection", () => {
    setup({ data: { intent: { ...RECORD, stale: true, stale_reason: "head_moved" } } });
    expect(screen.getByText("Stale")).toBeInTheDocument();
    expect(screen.getByText(/new commits/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Re-detect intent" }));
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("disables the button while detecting", () => {
    setup({ data: { intent: RECORD } }, true);
    expect(screen.getByRole("button", { name: /Detecting/ })).toBeDisabled();
  });

  it("error: ErrorState with retry", () => {
    setup({ isError: true });
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load the PR intent");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
