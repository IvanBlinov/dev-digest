import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../messages/en/agents.json";
import { ToastProvider } from "../../../../../lib/toast";

// Mock the data hooks so the editor renders without a network/query client.
const hooks = vi.hoisted(() => ({
  useUpdateAgent: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, data: undefined }),
  useProviderModels: () => ({ data: [{ id: "gpt-4.1", provider: "openai" }] }),
  useAllSkillsForAgentEditor: () => ({
    data: [{ id: "s1", name: "api-contract-guard", description: "", type: "security", source: "imported", body: "b", enabled: true, version: 1 }],
    isLoading: false,
    isError: false,
  }),
  useAgentSkills: () => ({ data: [], isLoading: false, isError: false }),
  useSetAgentSkills: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../../../../../lib/hooks/agents", () => hooks);
vi.mock("@/lib/hooks/agents", () => hooks);

import { AgentEditor } from "./AgentEditor";

afterEach(cleanup);

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("A2 Agent Editor (smoke)", () => {
  it("renders the Config tab fields", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    expect(screen.getByText("Config")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Save agent")).toBeInTheDocument();
  });

  it("L02: shows exactly two tabs — Config and Skills", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    const tabs = screen.getAllByRole("button").filter((b) => ["Config", "Skills"].includes(b.textContent ?? ""));
    expect(tabs.map((b) => b.textContent)).toEqual(["Config", "Skills"]);
    for (const gone of ["Evals", "Stats", "CI"]) expect(screen.queryByText(gone)).toBeNull();
  });

  it("L02: tab=skills renders the Skills tab and clicking a tab calls onTab", () => {
    const onTab = vi.fn();
    renderWithIntl(<AgentEditor agent={AGENT} tab="skills" onTab={onTab} />);
    expect(screen.getByText("Skills · 0 of 1 enabled")).toBeInTheDocument();
    expect(screen.getByText("api-contract-guard")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Config"));
    expect(onTab).toHaveBeenCalledWith("config");
  });
});
