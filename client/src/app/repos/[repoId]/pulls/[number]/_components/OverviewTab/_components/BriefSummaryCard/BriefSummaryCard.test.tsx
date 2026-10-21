import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrBrief, PrBriefResponse } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/brief.json";
import { ApiError } from "@/lib/api";
import { BriefSummaryCard } from "./BriefSummaryCard";

afterEach(cleanup);

const onGenerate = vi.fn();
beforeEach(() => onGenerate.mockClear());

const brief = (over: Partial<PrBrief> = {}): PrBrief => ({
  summary: "Adds a token-bucket rate limiter to the public API.",
  risks: [],
  review_focus: [],
  head_sha: "a1b2c3d4e5f6",
  generated_at: "2026-10-19T10:00:00.000Z",
  prompt_version: "brief-v1",
  input_hash: "h",
  provider: "openrouter",
  model: "openai/gpt-4.1-mini",
  tokens_in: 812,
  tokens_out: 130,
  cost_usd: 0.014,
  duration_ms: 4200,
  attempts: 1,
  inputs: [
    { kind: "intent", ref: "intent", status: "ok" },
    { kind: "blast", ref: "blast", status: "ok" },
    { kind: "files", ref: "changed files", status: "ok", shown: 9, total: 9 },
  ],
  dropped: { risks: 0, review_focus: 0 },
  ...over,
});

const response = (over: Partial<PrBriefResponse> = {}, b: Partial<PrBrief> | null = {}): PrBriefResponse => ({
  brief: b === null ? null : brief(b),
  stale: false,
  stale_reason: null,
  ...over,
});

function setup(props: Partial<React.ComponentProps<typeof BriefSummaryCard>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <BriefSummaryCard
        response={response()}
        loading={false}
        pending={false}
        error={null}
        onGenerate={onGenerate}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe("BriefSummaryCard", () => {
  it("AC-37: with no stored brief it shows the PR Brief label and a Generate brief button", () => {
    setup({ response: response({}, null) });
    expect(screen.getByText(/^PR Brief$/i)).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Generate brief" });
    fireEvent.click(button);
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it("AC-47: with a brief, the summary is shown and the refresh button regenerates", () => {
    setup();
    expect(screen.getByText("Adds a token-bucket rate limiter to the public API.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate brief" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: messages.refresh }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it("AC-48: while pending, skeletons are shown and the buttons are disabled and aria-busy", () => {
    const { container, unmount } = setup({ pending: true });
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
    const refresh = screen.getByRole("button", { name: messages.refresh });
    expect(refresh).toBeDisabled();
    expect(refresh).toHaveAttribute("aria-busy", "true");
    unmount();

    setup({ response: response({}, null), pending: true });
    const generate = screen.getByRole("button", { name: /Generate brief|Generating/i });
    expect(generate).toBeDisabled();
    expect(generate).toHaveAttribute("aria-busy", "true");
  });

  it("AC-49: a stale brief shows the reason banner and a Regenerate button", () => {
    setup({ response: response({ stale: true, stale_reason: "head_moved" }) });
    expect(screen.getByText("New commits since this brief was generated")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: messages.regenerate }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
    // the stale brief itself stays visible
    expect(screen.getByText("Adds a token-bucket rate limiter to the public API.")).toBeInTheDocument();
  });

  it("AC-49: a fresh brief shows no stale banner", () => {
    setup();
    expect(screen.queryByText("New commits since this brief was generated")).toBeNull();
    expect(screen.queryByRole("button", { name: messages.regenerate })).toBeNull();
  });

  it("AC-50: a failed POST shows the error with Retry and keeps the previous brief visible", () => {
    setup({ error: new ApiError("Provider exploded", 502, "external_service_error") });
    expect(screen.getByText(messages.errors.generic)).toBeInTheDocument();
    expect(screen.getByText("Adds a token-bucket rate limiter to the public API.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: messages.retry }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it("AC-50: 429 reads the wait time from details.retry_after_s", () => {
    setup({ error: new ApiError("rate limited", 429, "rate_limited", { retry_after_s: 31 }) });
    expect(screen.getByText("Too many brief generations — try again in 31 s")).toBeInTheDocument();
  });

  it("AC-50: 409 says a generation is already in progress", () => {
    setup({ error: new ApiError("busy", 409, "brief_in_progress") });
    expect(screen.getByText("Generation already in progress")).toBeInTheDocument();
  });

  it("AC-50: 422 brief_no_files says the PR has no changed files and disables Generate", () => {
    setup({ response: response({}, null), error: new ApiError("no files", 422, "brief_no_files") });
    expect(screen.getByText("This PR has no changed files")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate brief" })).toBeDisabled();
  });

  it("EC-17: a missing provider key links to Settings -> Models", () => {
    setup({ error: new ApiError("OPENROUTER_API_KEY is not configured", 500, "config_error") });
    const link = screen.getByRole("link", { name: /models/i });
    expect(link.getAttribute("href") ?? "").toMatch(/\/settings\/models/);
  });

  it("AC-39: Missing lists intent and blast; a truncated files input is not in it", () => {
    setup({
      response: response(
        {},
        {
          inputs: [
            { kind: "intent", ref: "intent", status: "missing" },
            { kind: "blast", ref: "blast", status: "unavailable" },
            { kind: "files", ref: "changed files", status: "truncated", shown: 300, total: 1240 },
            { kind: "pr_description", ref: "description", status: "ok" },
          ],
        },
      ),
    });
    expect(screen.getByText(/Missing:\s*intent,\s*blast/)).toBeInTheDocument();
    expect(screen.queryByText(/Missing:.*files/)).toBeNull();
  });

  it("AC-39: degraded and stale inputs are listed as missing too", () => {
    setup({
      response: response(
        {},
        {
          inputs: [
            { kind: "intent", ref: "intent", status: "stale" },
            { kind: "blast", ref: "blast", status: "degraded", reason: "repo_too_large" },
          ],
        },
      ),
    });
    expect(screen.getByText(/Missing:\s*intent,\s*blast/)).toBeInTheDocument();
  });

  it("AC-39: no Missing line when every input is ok", () => {
    setup();
    expect(screen.queryByText(/Missing:/)).toBeNull();
  });

  it("AC-52: a non-zero dropped count shows how many items were removed", () => {
    setup({ response: response({}, { dropped: { risks: 2, review_focus: 1 } }) });
    expect(screen.getByText(/3 items removed: file not in this PR or its blast radius/)).toBeInTheDocument();
  });

  it("AC-52: nothing is shown when nothing was dropped", () => {
    setup();
    expect(screen.queryByText(/items removed/)).toBeNull();
  });

  it("AC-53: the footer shows cost, tokens in and out, the model and the short head SHA", () => {
    setup();
    expect(screen.getByText(/\$0\.014/)).toBeInTheDocument();
    expect(screen.getByText(/812/)).toBeInTheDocument();
    expect(screen.getByText(/130/)).toBeInTheDocument();
    expect(screen.getByText(/openai\/gpt-4\.1-mini/)).toBeInTheDocument();
    expect(screen.getByText(/a1b2c3d/)).toBeInTheDocument();
    expect(screen.queryByText(/a1b2c3d4e5f6/)).toBeNull(); // the SHA is shortened
  });

  it("AC-54: Built from shows the partial file count and the blast degradation reason", () => {
    setup({
      response: response(
        {},
        {
          inputs: [
            { kind: "blast", ref: "blast", status: "degraded", reason: "repo_too_large" },
            { kind: "files", ref: "changed files", status: "truncated", shown: 300, total: 1240 },
          ],
        },
      ),
    });
    expect(screen.getByText(/files 300 of 1[ ,  ]?240/)).toBeInTheDocument();
    expect(screen.getByText(/blast degraded: repo_too_large/)).toBeInTheDocument();
  });

  it("AC-56: the summary renders as plain text, not Markdown or HTML", () => {
    const { container } = setup({
      response: response({}, { summary: "**Big** change <i>now</i> with `code` <script>alert(1)</script>" }),
    });
    expect(screen.getByText("**Big** change <i>now</i> with `code` <script>alert(1)</script>")).toBeInTheDocument();
    expect(container.querySelector("strong, i, code, script")).toBeNull();
  });
});
