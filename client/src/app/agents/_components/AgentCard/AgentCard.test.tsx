import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../messages/en/agents.json";
vi.mock("../../../../lib/hooks/agents", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useAgentFindings: (_id: string, enabled: boolean) => ({
    data: enabled
      ? [
          { id: "f1", severity: "CRITICAL", category: "security", title: "Hardcoded key", file: "src/config.ts", start_line: 12, end_line: 12, confidence: 0.98, rationale: "sk_live in diff", review_id: "rv", pr_id: "pr", pr_number: 482 },
        ]
      : undefined,
    isLoading: false,
  }),
}));

import { AgentCard } from "./AgentCard";

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
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("AgentCard (smoke)", () => {
  it("renders the agent name, model chip and skill count", () => {
    renderWithIntl(<AgentCard ag={AGENT} skillCount={3} />);
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
    expect(screen.getByText("3 skills")).toBeInTheDocument();
  });

  it("falls back to a translated placeholder when description is empty", () => {
    renderWithIntl(<AgentCard ag={{ ...AGENT, description: "" }} />);
    expect(screen.getByText("No description")).toBeInTheDocument();
  });

  it("L01: shows findings counters and a hover preview with PR numbers", () => {
    vi.useFakeTimers();
    try {
      renderWithIntl(<AgentCard ag={{ ...AGENT, findings: { critical: 1, warning: 0, suggestion: 0 } }} />);
      const chip = screen.getByLabelText("1 critical finding");
      expect(chip).toBeInTheDocument();
      fireEvent.mouseEnter(chip.parentElement!.parentElement!);
      fireEvent.mouseEnter(chip.parentElement!);
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(screen.getByText("#482")).toBeInTheDocument();
      expect(screen.getByText("Hardcoded key")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("L01: an agent without reviews shows —", () => {
    renderWithIntl(<AgentCard ag={{ ...AGENT, findings: null }} />);
    expect(screen.getByLabelText("Not reviewed yet")).toBeInTheDocument();
  });
});
