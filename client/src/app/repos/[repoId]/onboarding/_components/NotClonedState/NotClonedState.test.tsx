import type { ComponentProps } from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import onboarding from "../../../../../../../messages/en/onboarding.json";
import type { RepoIntelState } from "@/lib/hooks/repo-intel";
import { NotClonedState } from "./NotClonedState";

afterEach(cleanup);

type Props = Partial<ComponentProps<typeof NotClonedState>>;

function idx(over: Partial<RepoIntelState>): RepoIntelState {
  return {
    status: "full",
    filesIndexed: 5,
    filesSkipped: 0,
    lastIndexedSha: "abc",
    updatedAt: "2026-10-19T10:00:00.000Z",
    ...over,
  };
}

function ui(props: Props = {}) {
  return (
    <NextIntlClientProvider locale="en" messages={{ onboarding }}>
      <NotClonedState
        indexState={{ data: idx({}), isLoading: false, isError: false }}
        onClone={() => {}}
        pending={false}
        cloneState="idle"
        {...props}
      />
    </NextIntlClientProvider>
  );
}

describe("NotClonedState", () => {
  it("AC-50: shows 'Clone and index this repository to generate a tour'", () => {
    render(ui());
    expect(screen.getByText("Clone and index this repository to generate a tour")).toBeInTheDocument();
  });

  it("AC-50: the real index status is shown for every index state", () => {
    const cases: Array<[Props["indexState"], string]> = [
      [{ data: idx({ status: "full" }), isLoading: false, isError: false }, "Index status: indexed"],
      [{ data: idx({ status: "partial" }), isLoading: false, isError: false }, "Index status: partially indexed"],
      [
        { data: idx({ status: "degraded", reason: "no_data" }), isLoading: false, isError: false },
        "Index status: not indexed",
      ],
      [
        { data: idx({ status: "degraded", degraded: true, degradedReason: "parse_failed" }), isLoading: false, isError: false },
        "Index status: degraded",
      ],
      [{ data: idx({ status: "failed" }), isLoading: false, isError: false }, "Index status: index failed"],
      [{ data: undefined, isLoading: true, isError: false }, "Index status: checking…"],
      [{ data: undefined, isLoading: false, isError: true }, "Index status: unavailable"],
    ];
    for (const [indexState, text] of cases) {
      const { unmount } = render(ui({ indexState }));
      expect(screen.getByText(text)).toBeInTheDocument();
      unmount();
    }
  });

  it("AC-50: 'Clone and index' → onClone; no 'Generate onboarding tour' button", async () => {
    const user = userEvent.setup();
    const onClone = vi.fn();
    render(ui({ onClone }));
    await user.click(screen.getByRole("button", { name: "Clone and index" }));
    expect(onClone).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Generate onboarding tour" })).toBeNull();
  });

  it("R6: requested → 'Clone requested — this page updates when it finishes' and the button is disabled", () => {
    render(ui({ cloneState: "requested" }));
    expect(screen.getByText("Clone requested — this page updates when it finishes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clone and index" })).toBeDisabled();
  });

  it("R6: pending (the refresh request in flight) disables the button", () => {
    render(ui({ pending: true }));
    expect(screen.getByRole("button", { name: "Clone and index" })).toBeDisabled();
  });

  it("R6: timed_out → 'Still cloning — refresh the page to check' and the button is enabled", () => {
    render(ui({ cloneState: "timed_out" }));
    expect(screen.getByText("Still cloning — refresh the page to check")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clone and index" })).toBeEnabled();
  });

  it("R6: failed → alert 'Couldn't start the clone — try again' and the button is enabled", () => {
    render(ui({ cloneState: "failed" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't start the clone — try again");
    expect(screen.getByRole("button", { name: "Clone and index" })).toBeEnabled();
  });
});
