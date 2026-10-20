import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("./_components/BlastRadiusBlock", () => ({
  BlastRadiusBlock: ({ prId }: { prId: string | null }) => <div data-testid="blast-block">{prId}</div>,
}));

vi.mock("../VerdictBanner", () => ({
  VerdictBanner: ({ summary }: { summary: string | null }) => <div data-testid="verdict">{summary}</div>,
}));
vi.mock("./_components/BriefSummaryCard", () => ({
  BriefSummaryCard: ({ onGenerate }: { onGenerate: () => void }) => (
    <button data-testid="summary-card" onClick={onGenerate}>
      generate
    </button>
  ),
}));
vi.mock("./_components/RiskAreas", () => ({
  RiskAreas: () => <div data-testid="risks" />,
}));
vi.mock("./_components/ReviewFocus", () => ({
  ReviewFocus: ({ onNavigate }: { onNavigate: (href: string) => void }) => (
    <button data-testid="focus" onClick={() => onNavigate("?tab=diff&file=src%2Fa.ts&line=7")}>
      focus
    </button>
  ),
}));

const mutate = vi.fn();
const STORED = {
  brief: { summary: "s", risks: [], review_focus: [], head_sha: "abc", inputs: [] },
  stale: false,
  stale_reason: null,
};
vi.mock("@/lib/hooks/brief", () => ({
  usePrBrief: () => ({ data: STORED, isLoading: false }),
  useGenerateBrief: () => ({ mutate, isPending: false, error: null }),
}));

import { OverviewTab } from "./OverviewTab";

const onNavigate = vi.fn();
const blastProps = {
  prId: "p1",
  repoId: "r1",
  repoFullName: "acme/payments-api",
  headSha: "abc",
  changedFiles: ["src/a.ts"],
  latestReview: null,
  onNavigate,
};
const REVIEW = { verdict: "request_changes" as const, summary: "Needs work", score: 61, findingsCount: 6, blockers: 2, agentName: "Security" };

beforeEach(() => {
  mutate.mockClear();
  onNavigate.mockClear();
});
afterEach(cleanup);

const BODY = [
  "## What it does",
  "",
  "**Files changed** now reads like a review.",
  "",
  "- first item",
  "- second item with `code`",
  "",
  "<!-- demo video goes here -->",
  "<img src=x onerror=alert(1)>",
  "",
  "[bad](javascript:alert(1))",
].join("\n");

describe("OverviewTab", () => {
  it("renders the PR description as Markdown, not raw text", () => {
    render(<OverviewTab prBody={BODY} {...blastProps} />);
    expect(screen.getByRole("heading", { name: "What it does" })).toBeTruthy();
    expect(screen.getByText("Files changed").tagName).toBe("STRONG");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("code").tagName).toBe("CODE");
    expect(screen.queryByText(/## What it does/)).toBeNull();
  });

  it("does not render raw HTML or javascript: links from the author-controlled body", () => {
    const { container } = render(<OverviewTab prBody={BODY} {...blastProps} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).not.toContain("demo video goes here");
    const link = screen.getByText("bad").closest("a");
    expect(link?.getAttribute("href") ?? "").not.toMatch(/^javascript:/i);
  });

  it("renders the blast radius block with the PR id", () => {
    render(<OverviewTab prBody={BODY} {...blastProps} />);
    expect(screen.getByTestId("blast-block").textContent).toBe("p1");
  });

  it("AC-38: lays out summary card, then intent + risks beside blast radius, then review focus, then description", () => {
    render(<OverviewTab prBody={BODY} intentSlot={<div data-testid="intent">intent</div>} {...blastProps} />);
    const follows = (a: HTMLElement, b: HTMLElement) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    const card = screen.getByTestId("summary-card");
    const intent = screen.getByTestId("intent");
    const risks = screen.getByTestId("risks");
    const blast = screen.getByTestId("blast-block");
    const focus = screen.getByTestId("focus");
    const description = screen.getByRole("heading", { name: "What it does" });
    expect(follows(card, intent)).toBe(true);
    expect(follows(intent, risks)).toBe(true);
    expect(follows(risks, blast)).toBe(true);
    expect(follows(blast, focus)).toBe(true);
    expect(follows(focus, description)).toBe(true);
    // intent and risks share the left column; blast sits beside it, not inside it
    expect(intent.parentElement?.contains(risks)).toBe(true);
    expect(intent.parentElement?.contains(blast)).toBe(false);
    expect(intent.parentElement?.parentElement).toBe(blast.parentElement);
  });

  it("AC-40: the verdict banner shows when the PR has a reviewed verdict and is absent otherwise", () => {
    const { unmount } = render(<OverviewTab prBody={null} {...blastProps} latestReview={REVIEW} />);
    expect(screen.getByTestId("verdict").textContent).toBe("Needs work");
    expect(screen.getByTestId("summary-card")).toBeInTheDocument();
    unmount();
    render(<OverviewTab prBody={null} {...blastProps} />);
    expect(screen.queryByTestId("verdict")).toBeNull();
  });

  it("AC-46: with a stored brief nothing is generated on mount; only the user's click generates", () => {
    render(<OverviewTab prBody={null} {...blastProps} />);
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("summary-card"));
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("AC-61: activating a review-focus item navigates through onNavigate", () => {
    render(<OverviewTab prBody={null} {...blastProps} />);
    fireEvent.click(screen.getByTestId("focus"));
    expect(onNavigate).toHaveBeenCalledWith("?tab=diff&file=src%2Fa.ts&line=7");
  });

  it("has no description without a body, but the blast block still renders", () => {
    render(<OverviewTab prBody={null} {...blastProps} />);
    expect(screen.queryByText("Description")).toBeNull();
    expect(screen.getByTestId("blast-block")).toBeInTheDocument();
  });
});
