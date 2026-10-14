import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { OverviewTab } from "./OverviewTab";

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
    render(<OverviewTab prBody={BODY} />);
    expect(screen.getByRole("heading", { name: "What it does" })).toBeTruthy();
    expect(screen.getByText("Files changed").tagName).toBe("STRONG");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("code").tagName).toBe("CODE");
    expect(screen.queryByText(/## What it does/)).toBeNull();
  });

  it("does not render raw HTML or javascript: links from the author-controlled body", () => {
    const { container } = render(<OverviewTab prBody={BODY} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).not.toContain("demo video goes here");
    const link = screen.getByText("bad").closest("a");
    expect(link?.getAttribute("href") ?? "").not.toMatch(/^javascript:/i);
  });

  it("renders nothing without a body", () => {
    const { container } = render(<OverviewTab prBody={null} />);
    expect(container.textContent).toBe("");
  });
});
