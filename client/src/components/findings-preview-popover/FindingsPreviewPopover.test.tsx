import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { FindingsPreviewPopover, type PreviewFinding } from "./FindingsPreviewPopover";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function f(i: number, severity = "WARNING"): PreviewFinding {
  return {
    id: `f${i}`,
    severity,
    category: "perf",
    title: `Finding ${i}`,
    file: "src/api/users.ts",
    start_line: 45,
    end_line: 52,
    confidence: 0.86,
    rationale: "The loop on line 46 calls db.posts.findMany once per user. ".repeat(6),
  };
}

function open() {
  fireEvent.mouseEnter(screen.getByText("trigger"));
  act(() => {
    vi.advanceTimersByTime(200);
  });
}

describe("FindingsPreviewPopover (L01)", () => {
  it("opens after a short hover, lists at most `max` findings sorted by severity, shows +K more", () => {
    vi.useFakeTimers();
    const findings = [f(1), f(2), f(3, "CRITICAL"), f(4), f(5), f(6), f(7), f(8, "SUGGESTION")];
    render(
      <FindingsPreviewPopover title="8 findings" findings={findings} max={6}>
        <span>trigger</span>
      </FindingsPreviewPopover>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    open();
    const dialog = screen.getByRole("dialog", { name: "8 findings" });
    expect(dialog).toBeInTheDocument();
    const titles = screen.getAllByText(/^Finding \d$/).map((n) => n.textContent);
    expect(titles).toHaveLength(6);
    expect(titles[0]).toBe("Finding 3"); // CRITICAL first
    expect(screen.getByText("+2 more")).toBeInTheDocument();
    expect(screen.getAllByText("src/api/users.ts:45-52")).toHaveLength(6);
    expect(screen.getAllByText("● 86% conf")).toHaveLength(6);
  });

  it("closes on mouse leave and on Escape; renders the prefix", () => {
    vi.useFakeTimers();
    render(
      <FindingsPreviewPopover title="1 finding" findings={[f(1)]} renderPrefix={() => "#482"}>
        <span>trigger</span>
      </FindingsPreviewPopover>,
    );
    open();
    expect(screen.getByText("#482")).toBeInTheDocument();
    fireEvent.mouseLeave(screen.getByText("trigger"));
    expect(screen.queryByRole("dialog")).toBeNull();
    open();
    fireEvent.keyDown(screen.getByText("trigger"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows a loading line while fetching and an empty line when nothing is active", () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <FindingsPreviewPopover title="Findings" findings={[]} loading>
        <span>trigger</span>
      </FindingsPreviewPopover>,
    );
    open();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    rerender(
      <FindingsPreviewPopover title="Findings" findings={[]}>
        <span>trigger</span>
      </FindingsPreviewPopover>,
    );
    expect(screen.getByText("No active findings.")).toBeInTheDocument();
  });
});
