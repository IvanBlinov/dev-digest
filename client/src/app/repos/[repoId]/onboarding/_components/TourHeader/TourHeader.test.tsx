import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import onboarding from "../../../../../../../messages/en/onboarding.json";
import { NOW, tour, tourState } from "../../test-fixtures";
import { TourHeader } from "./TourHeader";

afterEach(cleanup);

function ui(state = tourState()) {
  return (
    <NextIntlClientProvider locale="en" messages={{ onboarding }} now={NOW} timeZone="UTC">
      <TourHeader repoName="payments-api" state={state} actions={<button type="button">slot-action</button>} />
    </NextIntlClientProvider>
  );
}

function withGeneration(over: Partial<ReturnType<typeof tour>["generation"]>) {
  const t = tour();
  return tourState({ tour: { ...t, generation: { ...t.generation, ...over } } });
}

describe("TourHeader", () => {
  it("AC-48: h1 'Onboarding for payments-api' and the actions slot is rendered", () => {
    render(ui());
    expect(screen.getByRole("heading", { level: 1, name: "Onboarding for payments-api" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "slot-action" })).toBeInTheDocument();
  });

  it("AC-48: without a tour only the title and actions show (no subtitle, no footnote)", () => {
    const { container } = render(ui(tourState({ status: "none", tour: null, index_updated_at: null })));
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(container).not.toHaveTextContent("Generated from index");
    expect(container).not.toHaveTextContent("openai/gpt-4.1-mini");
  });

  it("AC-49: 'Generated from index of 5 files · generated 2 hours ago · index 1 hour ago'", () => {
    const { container } = render(ui());
    expect(container).toHaveTextContent(
      "Generated from index of 5 files · generated 2 hours ago · index 1 hour ago",
    );
  });

  it("AC-49: partial → '… 120 of 5400 files (partial) …'; total null → '120 files (partial)'; index_updated_at null → no 'index' part", () => {
    const t = tour();
    const partial = tourState({
      tour: { ...t, coverage: { files_indexed: 120, files_total: 5400, partial: true } },
    });
    const first = render(ui(partial));
    expect(first.container.textContent).toMatch(/Generated from index of 120 of 5,?400 files \(partial\)/);
    first.unmount();

    const noTotal = tourState({
      tour: { ...t, coverage: { files_indexed: 120, files_total: null, partial: true } },
      index_updated_at: null,
    });
    const second = render(ui(noTotal));
    expect(second.container).toHaveTextContent("Generated from index of 120 files (partial)");
    expect(second.container).toHaveTextContent("generated 2 hours ago");
    expect(second.container.textContent).not.toMatch(/index \d+ \w+ ago/);
  });

  it("AC-66: 'openai/gpt-4.1-mini · 1 call · $0.0007'", () => {
    const { container } = render(ui());
    expect(container).toHaveTextContent("openai/gpt-4.1-mini · 1 call · $0.0007");
  });

  it("AC-66: cost null → 'cost unknown'; llm_calls 0 → '0 calls'", () => {
    const { container } = render(ui(withGeneration({ cost_usd: null, llm_calls: 0 })));
    expect(container).toHaveTextContent("openai/gpt-4.1-mini · 0 calls · cost unknown");
  });

  it("AC-58: failed + last_error {llm_timeout, 5 min ago} + tour from 2 h ago → the alert banner", () => {
    render(
      ui(
        tourState({
          status: "failed",
          last_error: { reason: "llm_timeout", at: "2026-10-19T10:55:00.000Z" },
        }),
      ),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Regeneration failed 5 minutes ago: Model timed out — showing the tour from 2 hours ago",
    );
  });

  it("AC-58: a ready tour shows no failed banner", () => {
    render(ui());
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
