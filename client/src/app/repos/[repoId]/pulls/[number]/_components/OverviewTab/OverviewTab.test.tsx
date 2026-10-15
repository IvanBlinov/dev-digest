import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("./_components/BlastRadiusBlock", () => ({
  BlastRadiusBlock: ({ prId }: { prId: string | null }) => <div data-testid="blast-block">{prId}</div>,
}));

import { OverviewTab } from "./OverviewTab";

const blastProps = { prId: "p1", repoId: "r1", repoFullName: "acme/payments-api", headSha: "abc" };

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

  it("renders the intent slot next to the blast block, after the description", () => {
    render(<OverviewTab prBody={BODY} intentSlot={<div data-testid="intent">intent</div>} {...blastProps} />);
    const intent = screen.getByTestId("intent");
    const blast = screen.getByTestId("blast-block");
    expect(intent.parentElement).toBe(blast.parentElement);
    const description = screen.getByRole("heading", { name: "What it does" });
    expect(description.compareDocumentPosition(intent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(intent.compareDocumentPosition(blast) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("has no description without a body, but the blast block still renders", () => {
    render(<OverviewTab prBody={null} {...blastProps} />);
    expect(screen.queryByText("Description")).toBeNull();
    expect(screen.getByTestId("blast-block")).toBeInTheDocument();
  });
});
