import type { ComponentProps } from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import onboarding from "../../../../../../../messages/en/onboarding.json";
import { tourState } from "../../test-fixtures";
import { TourActions } from "./TourActions";

afterEach(cleanup);

type Props = Partial<ComponentProps<typeof TourActions>>;

function ui(props: Props = {}) {
  return (
    <NextIntlClientProvider locale="en" messages={{ onboarding }}>
      <TourActions
        mode="tour"
        state={tourState()}
        pending={false}
        rateLimited={false}
        onGenerate={() => {}}
        onShare={() => {}}
        onCopyMarkdown={() => {}}
        {...props}
      />
    </NextIntlClientProvider>
  );
}

const EMPTY = tourState({ status: "none", tour: null });

describe("TourActions", () => {
  it("AC-52: mode empty → Generate + 'Makes one model call'; click → onGenerate", async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn();
    render(ui({ mode: "empty", state: EMPTY, onGenerate }));
    expect(screen.getByText("Makes one model call")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Generate onboarding tour" }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it("AC-53: generating → 'Generating…' and every generate/regenerate button disabled", () => {
    render(ui({ mode: "generating", state: tourState({ status: "generating" }) }));
    expect(screen.getByText("Generating…")).toBeInTheDocument();
    const gen = screen.getAllByRole("button", { name: /generat/i });
    expect(gen.length).toBeGreaterThan(0);
    for (const b of gen) expect(b).toBeDisabled();
  });

  it("AC-53: a mutation in flight (pending) disables Regenerate", () => {
    render(ui({ mode: "tour", pending: true }));
    expect(screen.getByRole("button", { name: /regenerate|generating/i })).toBeDisabled();
  });

  it("AC-51: cloned false → Regenerate disabled + 'Clone the repository to regenerate'", () => {
    render(ui({ mode: "tour", state: tourState({ cloned: false }) }));
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeDisabled();
    expect(screen.getByText("Clone the repository to regenerate")).toBeInTheDocument();
  });

  it("AC-52: cloned tour → Regenerate is enabled and calls onGenerate", async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn();
    render(ui({ mode: "tour", onGenerate }));
    await user.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Clone the repository to regenerate")).toBeNull();
  });

  it("AC-54: rateLimited → alert 'Too many generations — try again in a minute'", () => {
    render(ui({ mode: "empty", state: EMPTY, rateLimited: true }));
    expect(screen.getByRole("alert")).toHaveTextContent("Too many generations — try again in a minute");
  });

  it("AC-57: stale index_moved → 'Stale' + 'Index moved since this tour'; prompt_changed → 'Tour format changed'; not stale → no badge", () => {
    const first = render(ui({ state: tourState({ stale: true, stale_reason: "index_moved" }) }));
    expect(screen.getByText("Stale")).toBeInTheDocument();
    expect(screen.getByText("Index moved since this tour")).toBeInTheDocument();
    first.unmount();

    const second = render(ui({ state: tourState({ stale: true, stale_reason: "prompt_changed" }) }));
    expect(screen.getByText("Stale")).toBeInTheDocument();
    expect(screen.getByText("Tour format changed")).toBeInTheDocument();
    second.unmount();

    render(ui({ state: tourState() }));
    expect(screen.queryByText("Stale")).toBeNull();
  });

  it("AC-64 / AC-65: Share link → onShare; Copy as Markdown → onCopyMarkdown; both absent in mode empty", async () => {
    const user = userEvent.setup();
    const onShare = vi.fn();
    const onCopyMarkdown = vi.fn();
    const first = render(ui({ mode: "tour", onShare, onCopyMarkdown }));
    await user.click(screen.getByRole("button", { name: "Share link" }));
    await user.click(screen.getByRole("button", { name: "Copy as Markdown" }));
    expect(onShare).toHaveBeenCalledTimes(1);
    expect(onCopyMarkdown).toHaveBeenCalledTimes(1);
    first.unmount();

    render(ui({ mode: "empty", state: EMPTY }));
    expect(screen.queryByRole("button", { name: "Share link" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy as Markdown" })).toBeNull();
  });

  it("NFR-7: every button has a non-empty accessible name in every mode", () => {
    const cases: Props[] = [
      { mode: "empty", state: EMPTY },
      { mode: "tour" },
      { mode: "tour", state: tourState({ cloned: false, stale: true, stale_reason: "index_moved" }) },
      { mode: "generating", state: tourState({ status: "generating" }) },
    ];
    for (const c of cases) {
      const { unmount } = render(ui(c));
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThan(0);
      for (const b of buttons) expect(b).toHaveAccessibleName();
      unmount();
    }
  });
});
