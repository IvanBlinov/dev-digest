import type { ReactNode } from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { OnboardingTourState } from "@devdigest/shared";
import onboarding from "../../../../../../../messages/en/onboarding.json";
import { ToastProvider } from "@/lib/toast";
import { REPO, NOW, tourState } from "../../test-fixtures";

// ---- mocked boundaries (hooks, shell, router, diagram) -------------------------------------
const h = vi.hoisted(() => {
  const tourResult: { current: Record<string, unknown> } = { current: {} };
  const generate = { mutate: vi.fn(), isPending: false, data: undefined as unknown };
  const refresh = { mutate: vi.fn(), isPending: false };
  const outcome = { current: "started" as string };
  return {
    tourResult,
    generate,
    refresh,
    outcome,
    useOnboardingTour: vi.fn(),
    useGenerateOnboarding: vi.fn(),
    useRepoIntelStatus: vi.fn(),
    useResyncRepoIntel: vi.fn(),
    useRefreshRepo: vi.fn(),
    useRepoNotFound: vi.fn(),
    push: vi.fn(),
  };
});

vi.mock("@/lib/hooks/onboarding", async (o) => ({
  ...(await o<Record<string, unknown>>()),
  useOnboardingTour: h.useOnboardingTour,
  useGenerateOnboarding: h.useGenerateOnboarding,
}));
vi.mock("@/lib/hooks/repo-intel", async (o) => ({
  ...(await o<Record<string, unknown>>()),
  useRepoIntelStatus: h.useRepoIntelStatus,
  useResyncRepoIntel: h.useResyncRepoIntel,
}));
vi.mock("@/lib/hooks/core", async (o) => ({
  ...(await o<Record<string, unknown>>()),
  useRefreshRepo: h.useRefreshRepo,
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({
    repoId: "r1",
    activeRepo: REPO,
    repos: [REPO],
    reposLoaded: true,
    setRepoId: () => {},
  }),
  useRepoNotFound: h.useRepoNotFound,
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ crumb, children }: { crumb: Array<{ label: string }>; children: ReactNode }) => (
    <div>
      <div aria-label="breadcrumb">{crumb.map((c) => c.label).join(" › ")}</div>
      {children}
    </div>
  ),
}));
vi.mock("@/components/mermaid-diagram", () => ({
  MermaidDiagram: ({ chart }: { chart: string }) => <pre aria-label="diagram">{chart}</pre>,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push }),
  useParams: () => ({ repoId: "r1" }),
  usePathname: () => "/repos/r1/onboarding",
}));

import { OnboardingTourView } from "./OnboardingTourView";

// ---- helpers -------------------------------------------------------------------------------
function setTour(state: OnboardingTourState | undefined, over: Record<string, unknown> = {}) {
  h.tourResult.current = {
    data: state,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    clonePollTimedOut: false,
    ...over,
  };
}

function ui(repoId = "r1") {
  return (
    <NextIntlClientProvider locale="en" messages={{ onboarding }} now={NOW} timeZone="UTC">
      <ToastProvider>
        <OnboardingTourView repoId={repoId} />
      </ToastProvider>
    </NextIntlClientProvider>
  );
}

function stubClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  return writeText;
}

const NOT_CLONED = tourState({ cloned: false, status: "none", tour: null, index_updated_at: null });
const NONE = tourState({ status: "none", tour: null, index_updated_at: null });

beforeEach(() => {
  h.useOnboardingTour.mockReset().mockImplementation(() => h.tourResult.current);
  h.generate.mutate.mockReset().mockImplementation((_v: unknown, opts?: { onSuccess?: (r: string) => void }) => {
    h.generate.data = h.outcome.current;
    opts?.onSuccess?.(h.outcome.current);
  });
  h.generate.isPending = false;
  h.generate.data = undefined;
  h.outcome.current = "started";
  h.useGenerateOnboarding.mockReset().mockImplementation(() => h.generate);
  h.refresh.mutate.mockReset();
  h.refresh.isPending = false;
  h.useRefreshRepo.mockReset().mockImplementation(() => h.refresh);
  h.useResyncRepoIntel.mockReset().mockReturnValue({ mutate: vi.fn(), isPending: false });
  h.useRepoIntelStatus.mockReset().mockReturnValue({
    data: {
      status: "degraded",
      reason: "no_data",
      filesIndexed: 0,
      filesSkipped: 0,
      lastIndexedSha: "",
      updatedAt: "2026-10-19T10:00:00.000Z",
    },
    isLoading: false,
    isError: false,
  });
  h.useRepoNotFound.mockReset().mockReturnValue(false);
  h.push.mockReset();
  setTour(tourState());
});
afterEach(() => {
  cleanup();
  Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
});

const lastPoll = () => h.useOnboardingTour.mock.lastCall as [string, { pollUntilCloned?: boolean }];

// ---- tests ---------------------------------------------------------------------------------
describe("OnboardingTourView", () => {
  it("AC-48: breadcrumb 'acme/payments-api › Onboarding Tour'", () => {
    render(ui());
    expect(screen.getByLabelText("breadcrumb")).toHaveTextContent("acme/payments-api › Onboarding Tour");
    expect(screen.getByRole("heading", { level: 1, name: "Onboarding for payments-api" })).toBeInTheDocument();
  });

  it("AC-68: GET error → 'Couldn't load the onboarding tour'; Retry → refetch", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    setTour(undefined, { isError: true, refetch });
    render(ui());
    expect(screen.getByText("Couldn't load the onboarding tour")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("EC-1: unknown repo → 'Add a repository to see its onboarding tour' with a control to /onboarding", async () => {
    const user = userEvent.setup();
    h.useRepoNotFound.mockReturnValue(true);
    setTour(undefined);
    render(ui());
    expect(screen.getByText("Add a repository to see its onboarding tour")).toBeInTheDocument();
    const control = screen.getByText("Add repository");
    const anchor = control.closest("a");
    if (anchor) {
      expect(anchor).toHaveAttribute("href", "/onboarding");
    } else {
      await user.click(control);
      expect(h.push).toHaveBeenCalledWith("/onboarding");
    }
  });

  it("AC-50: not cloned, no tour → NotClonedState gets the useRepoIntelStatus result ('Index status: not indexed'); no Generate", () => {
    setTour(NOT_CLONED);
    render(ui());
    expect(screen.getByText("Clone and index this repository to generate a tour")).toBeInTheDocument();
    expect(screen.getByText("Index status: not indexed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate onboarding tour" })).toBeNull();
    expect(h.useRepoIntelStatus.mock.calls[0]![0]).toBe("r1");
  });

  it("AC-50: 'Clone and index' calls useRefreshRepo().mutate with 'r1' (POST /repos/:id/refresh); the useResyncRepoIntel spy is never called", async () => {
    const user = userEvent.setup();
    const resync = vi.fn();
    h.useResyncRepoIntel.mockReturnValue({ mutate: resync, isPending: false });
    setTour(NOT_CLONED);
    render(ui());
    await user.click(screen.getByRole("button", { name: "Clone and index" }));
    expect(h.refresh.mutate).toHaveBeenCalledTimes(1);
    expect(h.refresh.mutate.mock.calls[0]![0]).toBe("r1");
    expect(h.useResyncRepoIntel).not.toHaveBeenCalled();
    expect(resync).not.toHaveBeenCalled();
  });

  it("R6: after the refresh succeeds, useOnboardingTour is called with pollUntilCloned true and 'Clone requested …' shows", async () => {
    const user = userEvent.setup();
    setTour(NOT_CLONED);
    render(ui());
    expect(lastPoll()[0]).toBe("r1");
    expect(lastPoll()[1].pollUntilCloned).toBe(false);
    await user.click(screen.getByRole("button", { name: "Clone and index" }));
    act(() => {
      h.refresh.mutate.mock.calls[0]![1].onSuccess();
    });
    expect(lastPoll()[1].pollUntilCloned).toBe(true);
    expect(screen.getByText("Clone requested — this page updates when it finishes")).toBeInTheDocument();
  });

  it("R6: refresh mutation errors → pollUntilCloned false, alert 'Couldn't start the clone — try again', button enabled", async () => {
    const user = userEvent.setup();
    setTour(NOT_CLONED);
    render(ui());
    await user.click(screen.getByRole("button", { name: "Clone and index" }));
    act(() => {
      h.refresh.mutate.mock.calls[0]![1].onError(new Error("boom"));
    });
    expect(lastPoll()[1].pollUntilCloned).toBe(false);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't start the clone — try again");
    expect(screen.getByRole("button", { name: "Clone and index" })).toBeEnabled();
  });

  it("R6: clonePollTimedOut true → 'Still cloning — refresh the page to check' and pollUntilCloned false", async () => {
    const user = userEvent.setup();
    setTour(NOT_CLONED);
    const view = render(ui());
    await user.click(screen.getByRole("button", { name: "Clone and index" }));
    act(() => {
      h.refresh.mutate.mock.calls[0]![1].onSuccess();
    });
    setTour(NOT_CLONED, { clonePollTimedOut: true });
    view.rerender(ui());
    expect(screen.getByText("Still cloning — refresh the page to check")).toBeInTheDocument();
    expect(lastPoll()[1].pollUntilCloned).toBe(false);
  });

  it("R6: a repoId change (rerender r2) resets to idle with pollUntilCloned false", async () => {
    const user = userEvent.setup();
    setTour(NOT_CLONED);
    const view = render(ui("r1"));
    await user.click(screen.getByRole("button", { name: "Clone and index" }));
    act(() => {
      h.refresh.mutate.mock.calls[0]![1].onSuccess();
    });
    expect(lastPoll()[1].pollUntilCloned).toBe(true);
    view.rerender(ui("r2"));
    expect(lastPoll()[0]).toBe("r2");
    expect(lastPoll()[1].pollUntilCloned).toBe(false);
    expect(screen.queryByText("Clone requested — this page updates when it finishes")).toBeNull();
  });

  it("AC-52: none → Generate → generate.mutate()", async () => {
    const user = userEvent.setup();
    setTour(NONE);
    render(ui());
    expect(h.generate.mutate).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Generate onboarding tour" }));
    expect(h.generate.mutate).toHaveBeenCalledTimes(1);
  });

  it("AC-53: generating → 5 placeholders + 'Generating…'", () => {
    setTour(tourState({ status: "generating", tour: null }));
    render(ui());
    expect(screen.getAllByTestId("tour-placeholder")).toHaveLength(5);
    expect(screen.getByText("Generating…")).toBeInTheDocument();
  });

  it("AC-54: mutate resolves 'rate_limited' → the alert is shown", async () => {
    const user = userEvent.setup();
    h.outcome.current = "rate_limited";
    setTour(NONE);
    const view = render(ui());
    await user.click(screen.getByRole("button", { name: "Generate onboarding tour" }));
    view.rerender(ui());
    expect(screen.getByRole("alert")).toHaveTextContent("Too many generations — try again in a minute");
  });

  it("AC-55 / AC-41: ready → five cards in spec order with the five anchors", () => {
    render(ui());
    const regions = screen.getAllByRole("region");
    expect(regions.map((r) => r.id)).toEqual([
      "architecture-overview",
      "critical-paths",
      "how-to-run-locally",
      "guided-reading-path",
      "first-tasks",
    ]);
    expect(screen.getAllByRole("heading", { level: 2 }).map((x) => x.textContent)).toEqual([
      "Architecture overview",
      "Critical paths",
      "How to run locally",
      "Guided reading path",
      "First tasks",
    ]);
    expect(screen.getByRole("navigation", { name: "On this page" })).toBeInTheDocument();
  });

  it("AC-64: Share link → writeText(`${location.origin}/repos/r1/onboarding`) + 'Link copied'", async () => {
    const user = userEvent.setup();
    const writeText = stubClipboard();
    render(ui());
    await user.click(screen.getByRole("button", { name: "Share link" }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/repos/r1/onboarding`);
    expect(await screen.findByText("Link copied")).toBeInTheDocument();
  });

  it("AC-65: Copy as Markdown → text starts '# Onboarding for payments-api' + 'Markdown copied'", async () => {
    const user = userEvent.setup();
    const writeText = stubClipboard();
    render(ui());
    await user.click(screen.getByRole("button", { name: "Copy as Markdown" }));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(String(writeText.mock.calls[0]![0]).startsWith("# Onboarding for payments-api")).toBe(true);
    expect(await screen.findByText("Markdown copied")).toBeInTheDocument();
  });

  it("AC-61: Copy pnpm run dev → writeText('pnpm run dev') + 'Command copied'", async () => {
    const user = userEvent.setup();
    const writeText = stubClipboard();
    render(ui());
    await user.click(screen.getByRole("button", { name: "Copy pnpm run dev" }));
    expect(writeText).toHaveBeenCalledWith("pnpm run dev");
    expect(await screen.findByText("Command copied")).toBeInTheDocument();
  });

  it("AC-51: not cloned with a stored tour → the tour with Regenerate disabled", () => {
    setTour(tourState({ cloned: false }));
    render(ui());
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeDisabled();
    expect(screen.getByText("Clone the repository to regenerate")).toBeInTheDocument();
    expect(screen.getAllByRole("region")).toHaveLength(5);
  });

  it("Q1: failed + tour null → Generate + 'Last generation failed: Interrupted'", () => {
    setTour(
      tourState({
        status: "failed",
        tour: null,
        index_updated_at: null,
        last_error: { reason: "interrupted", at: "2026-10-19T10:55:00.000Z" },
      }),
    );
    render(ui());
    expect(screen.getByRole("button", { name: "Generate onboarding tour" })).toBeInTheDocument();
    expect(screen.getByText("Last generation failed: Interrupted")).toBeInTheDocument();
  });

  it("NFR-2: no state calls generate.mutate without a click", () => {
    const states: Array<[OnboardingTourState | undefined, Record<string, unknown>]> = [
      [NONE, {}],
      [NOT_CLONED, {}],
      [tourState({ status: "generating" }), {}],
      [tourState(), {}],
      [tourState({ status: "failed", tour: null, last_error: { reason: "interrupted", at: "2026-10-19T10:55:00.000Z" } }), {}],
      [undefined, { isError: true }],
      [undefined, { isLoading: true }],
    ];
    for (const [state, over] of states) {
      setTour(state, over);
      const { unmount } = render(ui());
      unmount();
    }
    expect(h.generate.mutate).not.toHaveBeenCalled();
  });
});
