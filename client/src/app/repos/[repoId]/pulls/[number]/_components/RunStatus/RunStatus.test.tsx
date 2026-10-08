import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunEvent } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

const { state } = vi.hoisted(() => ({
  state: { events: [] as RunEvent[], running: false, openRunIds: [] as string[] },
}));
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useRunEvents: () => state,
}));

import { RunStatus } from "./RunStatus";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const e = (runId: string, msg: string, extra: Partial<RunEvent> = {}): RunEvent => ({
  runId, seq: 1, kind: "info", msg, t: "18:06:04", ...extra,
});

describe("RunStatus — per-agent log sections", () => {
  it("renders nothing when there are no runs", () => {
    state.events = [];
    const { container } = renderWithIntl(<RunStatus runs={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows one collapsed section per agent; expanding shows only that agent's lines", () => {
    state.running = true;
    state.openRunIds = ["r1", "r2"];
    state.events = [
      e("r1", "Loading PR diff…", { kind: "tool", shared: "s1" }),
      e("r1", "general line"),
      e("r2", "security line"),
    ];
    renderWithIntl(
      <RunStatus runs={[{ runId: "r1", agentName: "General Reviewer" }, { runId: "r2", agentName: "Security Reviewer" }]} />,
    );
    const general = screen.getByRole("button", { name: /General Reviewer/ });
    const security = screen.getByRole("button", { name: /Security Reviewer/ });
    expect(general).toHaveAttribute("aria-expanded", "false");
    expect(security).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("[general line]")).toBeNull();

    fireEvent.click(security);
    expect(security).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByText("security line").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("general line").filter((n) => n.closest("[data-log-body]"))).toHaveLength(0);
  });

  it("shows the shared preparation lines once, in their own section", () => {
    state.events = [
      e("r1", "Diff ready — starting 2 agent run(s)", { shared: "s2" }),
      e("r2", "Diff ready — starting 2 agent run(s)", { shared: "s2" }),
    ];
    renderWithIntl(
      <RunStatus runs={[{ runId: "r1", agentName: "A" }, { runId: "r2", agentName: "B" }]} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Preparation/ }));
    expect(screen.getAllByText("Diff ready — starting 2 agent run(s)").filter((n) => n.closest("[data-log-body]"))).toHaveLength(1);
  });

  it("a single-agent run is expanded by default", () => {
    state.events = [e("r1", "only agent line")];
    state.openRunIds = ["r1"];
    renderWithIntl(<RunStatus runs={[{ runId: "r1", agentName: "Solo" }]} />);
    expect(screen.getByRole("button", { name: /Solo/ })).toHaveAttribute("aria-expanded", "true");
  });
});
