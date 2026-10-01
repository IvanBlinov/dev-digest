import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionsState, CreateConventionSkillResult } from "@devdigest/shared";
import conventions from "../../../../../messages/en/conventions.json";
import common from "../../../../../messages/en/common.json";
import { ToastProvider } from "@/lib/toast";
import { candidate, REPO_ID, scan, state } from "./test-fixtures";

const h = vi.hoisted(() => ({
  extractMutate: vi.fn(),
  deselectMutate: vi.fn(),
  query: { data: undefined as unknown, isLoading: false, isError: false, refetch: vi.fn() },
  repo: { activeRepo: { id: "r", full_name: "IvanBlinov/dev-digest" } as unknown, repoId: "r" as string | null, reposLoaded: true },
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/repo-context", () => ({ useActiveRepo: () => h.repo }));
vi.mock("@/lib/hooks/conventions", () => ({
  useConventions: () => h.query,
  useExtractConventions: () => ({ mutate: h.extractMutate, isPending: false }),
  useDeselectConventions: () => ({ mutate: h.deselectMutate, isPending: false }),
  useUpdateConvention: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("./_components/CreateConventionSkillModal", () => ({
  CreateConventionSkillModal: (p: { candidateIds: string[]; onCreated: (r: CreateConventionSkillResult) => void }) => (
    <div data-testid="create-modal">
      {p.candidateIds.join(",")}
      <button
        onClick={() => p.onCreated({ skill: { id: "sk1", name: "repo-conventions" }, linked_agent_id: null } as CreateConventionSkillResult)}
      >
        stub-create
      </button>
    </div>
  ),
}));

import { ConventionsView } from "./ConventionsView";
import { acceptedIds, scanButtonMode } from "./helpers";

afterEach(cleanup);
beforeEach(() => {
  h.extractMutate.mockReset();
  h.deselectMutate.mockReset();
  h.query = { data: state(), isLoading: false, isError: false, refetch: vi.fn() };
  h.repo = { activeRepo: { id: REPO_ID, full_name: "IvanBlinov/dev-digest" }, repoId: REPO_ID, reposLoaded: true };
});

function setup() {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions, common }} now={new Date()} timeZone="UTC">
      <ToastProvider>
        <ConventionsView />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

const withData = (over: Partial<ConventionsState>) => {
  h.query = { ...h.query, data: state(over) };
};

describe("ConventionsView", () => {
  it("heads the page with the repo and the scan summary", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Conventions in IvanBlinov/dev-digest" })).toBeInTheDocument();
    expect(screen.getByText(/Detected from 3 sample files · last scan 1 hour ago/)).toBeInTheDocument();
  });

  it("before the first scan shows Run Scan (req 45) and starts a scan", () => {
    withData({ scan: null, candidates: [] });
    setup();
    expect(screen.getByText("No conventions extracted yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ReScan" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run Scan" }));
    expect(h.extractMutate).toHaveBeenCalled();
  });

  it("after a scan shows ReScan instead of Run Scan (req 45)", () => {
    setup();
    expect(screen.queryByRole("button", { name: "Run Scan" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ReScan" }));
    expect(h.extractMutate).toHaveBeenCalled();
  });

  it("while a scan runs the button reads Scanning… and is disabled", () => {
    withData({ scan: scan({ status: "running", finished_at: null }) });
    setup();
    expect(screen.getByRole("button", { name: "Scanning…" })).toBeDisabled();
  });

  it("a failed scan shows its error and lets you retry with the same button", () => {
    withData({ scan: scan({ status: "failed", error: "model timed out" }), candidates: [] });
    setup();
    expect(screen.getByText(/Last scan failed: model timed out/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ReScan" }));
    expect(h.extractMutate).toHaveBeenCalled();
  });

  it("explains an unindexed repo and disables scanning", () => {
    withData({ indexed: false, scan: null, candidates: [] });
    setup();
    expect(screen.getByText("This repository isn't indexed yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run Scan" })).toBeDisabled();
  });

  it("asks to pick a repo when none is selected", () => {
    h.repo = { activeRepo: null, repoId: null, reposLoaded: true };
    h.query = { data: undefined, isLoading: false, isError: false, refetch: vi.fn() };
    setup();
    expect(screen.getByText("No repository selected")).toBeInTheDocument();
  });

  it("renders a card per candidate and the accepted counter (req 46)", () => {
    setup();
    expect(screen.getByText("1 of 2 accepted")).toBeInTheDocument();
    expect(screen.getByText("Files use kebab-case names")).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });

  it("hides Create skill when nothing is accepted (req 50)", () => {
    withData({ candidates: [candidate({ id: "b" })] });
    setup();
    expect(screen.queryByRole("button", { name: "Create skill" })).not.toBeInTheDocument();
  });

  it("Deselect all sends every accepted id back to pending", () => {
    withData({
      candidates: [
        candidate({ id: "a", status: "accepted", accepted: true }),
        candidate({ id: "b" }),
        candidate({ id: "c", status: "accepted", accepted: true }),
      ],
    });
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Deselect all" }));
    expect(h.deselectMutate).toHaveBeenCalledWith(["a", "c"]);
  });

  it("Create skill opens the modal with the accepted ids, then links to the new skill", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    expect(screen.getByTestId("create-modal")).toHaveTextContent("a");
    fireEvent.click(screen.getByRole("button", { name: "stub-create" }));
    expect(screen.queryByTestId("create-modal")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open skill" })).toHaveAttribute("href", "/skills/sk1");
  });

  it("shows a load error with retry", () => {
    const refetch = vi.fn();
    h.query = { data: undefined, isLoading: false, isError: true, refetch };
    setup();
    expect(screen.getByText("Could not load conventions.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalled();
  });
});

describe("ConventionsView helpers", () => {
  it("picks the scan button mode (req 45)", () => {
    expect(scanButtonMode(undefined, false)).toBe("run");
    expect(scanButtonMode(state({ scan: null }), false)).toBe("run");
    expect(scanButtonMode(state(), false)).toBe("rescan");
    expect(scanButtonMode(state({ scan: scan({ status: "running" }) }), false)).toBe("scanning");
    expect(scanButtonMode(state({ scan: null }), true)).toBe("scanning");
  });

  it("collects accepted ids in order", () => {
    expect(acceptedIds(state().candidates)).toEqual(["a"]);
  });
});
