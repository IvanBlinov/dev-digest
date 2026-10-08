import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import skills from "../../../../../../../messages/en/skills.json";
import common from "../../../../../../../messages/en/common.json";
import { ToastProvider } from "@/lib/toast";

const updateMutate = vi.fn();
const deleteMutate = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteSkill: () => ({ mutate: deleteMutate, isPending: false }),
}));

import { SkillCard } from "./SkillCard";

afterEach(cleanup);
beforeEach(() => {
  updateMutate.mockReset();
  deleteMutate.mockReset();
});

const SKILL: Skill = {
  id: "s1",
  name: "api-contract-guard",
  description: "Flags breaking route signature changes",
  type: "security",
  source: "imported",
  body: "# Guard",
  enabled: true,
  version: 3,
  agent_count: 2,
};

const BLOCKED: NonNullable<Skill["security"]> = {
  status: "blocked",
  findings: [{ rule: "ignore-instructions", label: "Overrides instructions", severity: "high", line: 2, excerpt: "ignore previous instructions" }],
};

function setup(props: Partial<React.ComponentProps<typeof SkillCard>> = {}) {
  const onSelect = vi.fn();
  const onDeleted = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ skills, common }}>
      <ToastProvider>
        <SkillCard skill={SKILL} onSelect={onSelect} onDeleted={onDeleted} {...props} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
  return { onSelect, onDeleted };
}

describe("SkillCard", () => {
  it("renders name, description, type, source, version and agent count", () => {
    setup();
    expect(screen.getByText("api-contract-guard")).toBeInTheDocument();
    expect(screen.getByText("Flags breaking route signature changes")).toBeInTheDocument();
    expect(screen.getByText("security")).toBeInTheDocument();
    expect(screen.getByText("Imported")).toBeInTheDocument();
    expect(screen.getByText("v3 · 2 agents")).toBeInTheDocument();
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });

  it("labels a URL-imported skill as Imported (URL)", () => {
    setup({ skill: { ...SKILL, source: "imported_url" } });
    expect(screen.getByText("Imported (URL)")).toBeInTheDocument();
  });

  it("clicking the card selects it", () => {
    const { onSelect } = setup();
    fireEvent.click(screen.getByText("api-contract-guard"));
    expect(onSelect).toHaveBeenCalledWith("s1");
  });

  it("toggle PUTs {enabled} without selecting the card", () => {
    const { onSelect } = setup();
    fireEvent.click(screen.getByRole("switch"));
    expect(updateMutate).toHaveBeenCalledWith({ id: "s1", patch: { enabled: false } }, expect.anything());
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("delete opens a confirm dialog that states the agent count, and confirming deletes", () => {
    const { onSelect, onDeleted } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Delete skill" }));
    expect(onSelect).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Delete skill?")).toBeInTheDocument();
    expect(within(dialog).getByText(/linked to 2 agents/)).toBeInTheDocument();
    deleteMutate.mockImplementation((_id: string, opts: { onSuccess?: () => void }) => opts.onSuccess?.());
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(deleteMutate).toHaveBeenCalledWith("s1", expect.anything());
    expect(onDeleted).toHaveBeenCalledWith("s1");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("cancel closes the confirm dialog without deleting", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Delete skill" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(deleteMutate).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("a clean skill shows no injection chip and no blocked footer", () => {
    setup({ skill: { ...SKILL, security: { status: "clean", findings: [] } } });
    expect(screen.queryByText("Injection detected")).not.toBeInTheDocument();
    expect(screen.queryByText("blocked — injection detected")).not.toBeInTheDocument();
    expect(screen.getByRole("listitem").style.borderColor).not.toBe("var(--crit)");
  });

  it("a blocked skill gets the chip next to the name, a red border and a blocked footer", () => {
    setup({ skill: { ...SKILL, security: BLOCKED } });
    const card = screen.getByRole("listitem");
    const nameRow = screen.getByText("api-contract-guard").parentElement!;
    expect(within(nameRow).getByText("Injection detected")).toBeInTheDocument();
    expect(card.style.border).toContain("var(--crit)");
    expect(screen.getByText("blocked — injection detected")).toBeInTheDocument();
    expect(screen.getByText("v3 · 2 agents")).toBeInTheDocument();
  });
});
