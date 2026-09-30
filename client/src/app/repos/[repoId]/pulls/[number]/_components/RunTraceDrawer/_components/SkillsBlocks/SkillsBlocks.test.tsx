import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillPromptBlock } from "@devdigest/shared";
import runs from "../../../../../../../../../../messages/en/runs.json";
import { SkillsBlocks } from "./SkillsBlocks";

const BLOCKS: SkillPromptBlock[] = [
  { skill_id: "s-1", name: "SQL safety", version: 3, type: "rule", tokens: 120, text: "never concat sql" },
  { skill_id: "s-2", name: "Auth checks", version: 1, type: "rule", tokens: 80, text: "check authz" },
];

afterEach(cleanup);

function renderBlocks(blocks: SkillPromptBlock[], totalTokens: number | null) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs }}>
      <SkillsBlocks blocks={blocks} totalTokens={totalTokens} />
    </NextIntlClientProvider>,
  );
}

describe("SkillsBlocks", () => {
  it("renders the header with the skill count and the skills-block token total", () => {
    renderBlocks(BLOCKS, 215);
    expect(screen.getByText("Skills")).toBeInTheDocument();
    expect(screen.getByText("2 skills · 215 tokens")).toBeInTheDocument();
  });

  it("renders one labelled block per skill, in the given order", () => {
    renderBlocks(BLOCKS, 215);
    const labels = screen.getAllByText(/ · v\d+ · \d+ tokens$/).map((el) => el.textContent);
    expect(labels).toEqual(["SQL safety · v3 · 120 tokens", "Auth checks · v1 · 80 tokens"]);
  });

  it("falls back to the sum of per-skill tokens when skills_tokens is null", () => {
    renderBlocks(BLOCKS, null);
    expect(screen.getByText("2 skills · 200 tokens")).toBeInTheDocument();
  });

  it("uses the singular form for a single skill", () => {
    renderBlocks([BLOCKS[0]!], 120);
    expect(screen.getByText("1 skill · 120 tokens")).toBeInTheDocument();
  });

  it("renders nothing for an empty list", () => {
    const { container } = renderBlocks([], 0);
    expect(container).toBeEmptyDOMElement();
  });
});
