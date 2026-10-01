import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AgentSkillLink, Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";

const mutate = vi.fn();
let links: AgentSkillLink[] = [];

function skill(id: string, name: string, type: Skill["type"], enabled = true): Skill {
  return { id, name, description: "", type, source: "manual", body: "b", enabled, version: 1 } as Skill;
}

const SKILLS: Skill[] = [
  skill("s1", "zeta-rules", "convention"),
  skill("s2", "alpha-guard", "security"),
  skill("s3", "mid-check", "rubric"),
  skill("s4", "beta-off", "custom", false),
];

vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS, isLoading: false, isError: false }),
}));
vi.mock("@/lib/hooks/agents", () => ({
  useAgentSkills: () => ({ data: links, isLoading: false, isError: false }),
  useSetAgentSkills: () => ({ mutate, isPending: false }),
}));

import { SkillsTab } from "./SkillsTab";

beforeEach(() => {
  mutate.mockReset();
  links = [
    { agent_id: "ag1", skill_id: "s3", order: 0, enabled: true },
    { agent_id: "ag1", skill_id: "s1", order: 1, enabled: true },
    { agent_id: "ag1", skill_id: "s2", order: 2, enabled: false },
  ];
});
afterEach(cleanup);

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <SkillsTab agentId="ag1" />
    </NextIntlClientProvider>,
  );
}

const row = (name: string) => screen.getByRole("listitem", { name });

describe("Agent editor · Skills tab", () => {
  it("lists every skill with its type chip and an 'X of Y enabled' header", () => {
    renderTab();
    expect(screen.getByText("Skills · 2 of 4 enabled")).toBeInTheDocument();
    const names = screen.getAllByRole("listitem").map((li) => li.getAttribute("aria-label"));
    expect(names).toEqual(["mid-check", "zeta-rules", "alpha-guard", "beta-off"]);
    expect(within(row("alpha-guard")).getByText("security")).toBeInTheDocument();
    expect(screen.getByText(/Order matters/)).toBeInTheDocument();
  });

  it("gives drag handles only to enabled rows", () => {
    renderTab();
    expect(within(row("mid-check")).getByLabelText("Drag to reorder")).toBeInTheDocument();
    expect(within(row("zeta-rules")).getByLabelText("Drag to reorder")).toBeInTheDocument();
    expect(within(row("alpha-guard")).queryByLabelText("Drag to reorder")).toBeNull();
    expect(within(row("beta-off")).queryByLabelText("Drag to reorder")).toBeNull();
    expect(row("mid-check")).toHaveAttribute("draggable", "true");
    expect(row("alpha-guard")).not.toHaveAttribute("draggable", "true");
  });

  it("filters by name (case-insensitive) and disables dragging while filtering", () => {
    renderTab();
    fireEvent.change(screen.getByPlaceholderText("Filter skills…"), { target: { value: "ZETA" } });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(row("zeta-rules")).toBeInTheDocument();
    expect(within(row("zeta-rules")).queryByLabelText("Drag to reorder")).toBeNull();
    expect(screen.getByText(/Clear the filter to reorder/)).toBeInTheDocument();
  });

  it("checking a skill appends it to the enabled list and persists the full order", () => {
    renderTab();
    fireEvent.click(within(row("alpha-guard")).getByRole("checkbox"));
    expect(mutate).toHaveBeenCalledWith([
      { skill_id: "s3", enabled: true },
      { skill_id: "s1", enabled: true },
      { skill_id: "s2", enabled: true },
    ]);
  });

  it("unchecking keeps the link with enabled=false", () => {
    renderTab();
    fireEvent.click(within(row("mid-check")).getByRole("checkbox"));
    expect(mutate).toHaveBeenCalledWith([
      { skill_id: "s1", enabled: true },
      { skill_id: "s2", enabled: false },
      { skill_id: "s3", enabled: false },
    ]);
  });

  it("the ↑ button moves an enabled skill earlier in the prompt", () => {
    renderTab();
    fireEvent.click(within(row("zeta-rules")).getByLabelText("Move up"));
    expect(mutate).toHaveBeenCalledWith([
      { skill_id: "s1", enabled: true },
      { skill_id: "s3", enabled: true },
      { skill_id: "s2", enabled: false },
    ]);
  });

  it("drag & drop between enabled rows reorders", () => {
    renderTab();
    fireEvent.dragStart(row("zeta-rules"));
    fireEvent.dragOver(row("mid-check"));
    fireEvent.drop(row("mid-check"));
    expect(mutate).toHaveBeenCalledWith([
      { skill_id: "s1", enabled: true },
      { skill_id: "s3", enabled: true },
      { skill_id: "s2", enabled: false },
    ]);
  });

  it("a globally disabled skill is greyed with a hint and cannot be checked", () => {
    renderTab();
    const off = row("beta-off");
    expect(within(off).getByText("disabled globally")).toBeInTheDocument();
    fireEvent.click(within(off).getByRole("checkbox"));
    expect(mutate).not.toHaveBeenCalled();
  });
});
