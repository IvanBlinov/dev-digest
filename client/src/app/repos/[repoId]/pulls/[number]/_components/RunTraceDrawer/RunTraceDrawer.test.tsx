import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/runs.json"; // apps/web/messages/en/runs.json

// Mock the trace hooks so the drawer renders without a query client / SSE.
const TRACE: RunTrace = {
  config: { agent: "Security", version: "1", provider: "openai", model: "gpt-4.1", pr: 482, source: "local" },
  stats: { duration_ms: 8200, tokens_in: 12000, tokens_out: 1500, findings: 2, grounding: "2/2 passed", cost_usd: 0.0187 },
  prompt_assembly: { system: "You are a reviewer.", skills: "### skill", memory: null, specs: null, user: "Review PR #482" },
  tool_calls: [{ tool: "review_file", args: "src/config.ts", meta: "single-pass", ms: 1200 }],
  raw_output: '{"verdict":"request_changes"}',
  memory_pulled: [{ pr: 471, text: "rate-limit public endpoints" }],
  specs_read: [],
  log: [
    { t: "00.10", kind: "info", msg: "Starting review with agent Security" },
    { t: "00.90", kind: "result", msg: "Citation grounding: 2/2 passed" },
  ],
};

// Per-test override of the trace the mocked hook returns (defaults to TRACE).
let currentTrace: RunTrace = TRACE;

vi.mock("../../../../../../../lib/hooks/trace", () => ({
  useRunTrace: () => ({ data: currentTrace, isLoading: false }),
}));
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useRunEvents: () => ({ events: [], running: false }),
}));

import RunTraceDrawer from "./RunTraceDrawer";

afterEach(() => {
  cleanup();
  currentTrace = TRACE;
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <div data-theme="dark">{ui}</div>
    </NextIntlClientProvider>,
  );
}

describe("A5 Run Trace drawer (smoke)", () => {
  it("renders the trace tabs and stats", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Stats")).toBeInTheDocument();
    expect(screen.getByText("2/2 passed")).toBeInTheDocument();
    // L01: fourth stat = run cost
    expect(screen.getByText("COST")).toBeInTheDocument();
    expect(screen.getByText("$0.0187")).toBeInTheDocument();
    expect(screen.getByText("Tool calls")).toBeInTheDocument();
  });

  it("switches to the live log tab", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("log"));
    // LiveLogStream renders its filter input
    expect(screen.getByPlaceholderText("Filter log…")).toBeInTheDocument();
  });
});

describe("L02 skills in the prompt assembly trace", () => {
  const SKILLS_TRACE: RunTrace = {
    ...TRACE,
    prompt_assembly: {
      ...TRACE.prompt_assembly,
      skills: "### Skill: api-contract-guard (v3, security)\nA\n\n### Skill: test-quality (v1, convention)\nB",
      skills_blocks: [
        { skill_id: "s1", name: "api-contract-guard", version: 3, type: "security", tokens: 120, text: "### Skill: api-contract-guard (v3, security)\nA" },
        { skill_id: "s2", name: "test-quality", version: 1, type: "convention", tokens: 85, text: "### Skill: test-quality (v1, convention)\nB" },
      ],
      skills_tokens: 207,
    },
  };

  function openPromptAssembly() {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("Prompt assembly"));
  }

  it("renders a Skills section with the total and one block per skill, in order", () => {
    currentTrace = SKILLS_TRACE;
    openPromptAssembly();
    expect(screen.getByText("Skills")).toBeInTheDocument();
    expect(screen.getByText("2 skills · 207 tokens")).toBeInTheDocument();
    const first = screen.getByText("api-contract-guard · v3 · 120 tokens");
    const second = screen.getByText("test-quality · v1 · 85 tokens");
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // the legacy single block is replaced, not duplicated
    expect(screen.queryByText("Skills (dynamic)")).not.toBeInTheDocument();
  });

  it("falls back to the legacy single skills block for pre-L02 traces", () => {
    openPromptAssembly();
    expect(screen.getByText("Skills (dynamic)")).toBeInTheDocument();
    expect(screen.queryByText(/skills · \d+ tokens/)).not.toBeInTheDocument();
  });

  it("renders nothing for skills when no skill was injected", () => {
    currentTrace = {
      ...TRACE,
      prompt_assembly: { ...TRACE.prompt_assembly, skills: null, skills_blocks: null, skills_tokens: null },
    };
    openPromptAssembly();
    expect(screen.getByText("System")).toBeInTheDocument();
    expect(screen.queryByText("Skills")).not.toBeInTheDocument();
    expect(screen.queryByText("Skills (dynamic)")).not.toBeInTheDocument();
  });
});
