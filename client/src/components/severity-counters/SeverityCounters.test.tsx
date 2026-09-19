import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SeverityCounters } from "./SeverityCounters";

afterEach(cleanup);

describe("SeverityCounters (L01)", () => {
  it("renders only non-zero levels with accessible labels", () => {
    render(<SeverityCounters counts={{ critical: 2, warning: 0, suggestion: 4 }} />);
    expect(screen.getByLabelText("2 critical findings")).toBeInTheDocument();
    expect(screen.getByLabelText("4 suggestion findings")).toBeInTheDocument();
    expect(screen.queryByLabelText(/warning/)).toBeNull();
  });

  it("shows ✓ 0 when reviewed and clean, and — when never reviewed", () => {
    const { rerender } = render(<SeverityCounters counts={{ critical: 0, warning: 0, suggestion: 0 }} />);
    expect(screen.getByLabelText("Reviewed, no active findings")).toBeInTheDocument();
    rerender(<SeverityCounters counts={null} />);
    expect(screen.getByLabelText("Not reviewed yet")).toHaveTextContent("—");
  });

  it("calls onSelect with the level and marks the active one", () => {
    const onSelect = vi.fn();
    render(<SeverityCounters counts={{ critical: 1, warning: 3, suggestion: 0 }} onSelect={onSelect} active="WARNING" />);
    fireEvent.click(screen.getByLabelText("1 critical finding, filter"));
    expect(onSelect).toHaveBeenCalledWith("CRITICAL");
    expect(screen.getByLabelText("3 warning findings, filter")).toHaveAttribute("aria-pressed", "true");
  });

  it("renders links when hrefFor is given", () => {
    render(
      <SeverityCounters counts={{ critical: 1, warning: 0, suggestion: 0 }} hrefFor={(l) => `/pr?severity=${l}`} />,
    );
    expect(screen.getByLabelText("1 critical finding, filter")).toHaveAttribute("href", "/pr?severity=CRITICAL");
  });
});
