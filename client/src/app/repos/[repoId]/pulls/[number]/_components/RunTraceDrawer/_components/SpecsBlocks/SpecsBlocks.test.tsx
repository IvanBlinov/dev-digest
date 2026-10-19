import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ProjectContextBlock, ProjectContextSkip } from "@devdigest/shared";
import runs from "../../../../../../../../../../messages/en/runs.json";
import { SpecsBlocks } from "./SpecsBlocks";

const BLOCKS: ProjectContextBlock[] = [
  { path: "docs/architecture.md", kind: "docs", origin: "attached", tokens: 70, text: "api does not import db", truncated: false },
  { path: "docs/adr-1.md", kind: "docs", origin: "auto", tokens: 50, text: "use postgres", truncated: false },
];

afterEach(cleanup);

function renderBlocks(blocks: ProjectContextBlock[], skipped: ProjectContextSkip[], totalTokens: number | null) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs }}>
      <SpecsBlocks blocks={blocks} skipped={skipped} totalTokens={totalTokens} />
    </NextIntlClientProvider>,
  );
}

describe("SpecsBlocks", () => {
  it("AC-55: header, labelled sub-blocks, full text on expand, copy control", () => {
    renderBlocks(BLOCKS, [], 120);
    const head = screen.getByText("Project context — attached specs (untrusted)").parentElement!;
    expect(head.textContent).toBe("Project context — attached specs (untrusted)2 docs · 120 tokens");
    expect(screen.getByText("docs/architecture.md · attached · 70 tokens")).toBeInTheDocument();
    expect(screen.getByText("docs/adr-1.md · auto · 50 tokens")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Copy" })).toHaveLength(2);
    fireEvent.click(screen.getByText("docs/architecture.md · attached · 70 tokens"));
    expect(screen.getByText("api does not import db")).toBeInTheDocument();
  });

  it("AC-57: skipped rows show the path and a reason label", () => {
    renderBlocks([], [
      { path: "docs/gone.md", reason: "not_found" },
      { path: "docs/huge.md", reason: "over_budget" },
    ], null);
    expect(screen.getByText("docs/gone.md")).toBeInTheDocument();
    expect(screen.getByText("not found")).toBeInTheDocument();
    expect(screen.getByText("docs/huge.md")).toBeInTheDocument();
    expect(screen.getByText("over budget")).toBeInTheDocument();
  });

  it("renders nothing when there are no blocks and no skips", () => {
    const { container } = renderBlocks([], [], null);
    expect(container).toBeEmptyDOMElement();
  });
});
