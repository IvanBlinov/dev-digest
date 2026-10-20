import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("../../../lib/repo-context", () => ({ useActiveRepo: () => ({ repoId: "r1" }) }));

import { useGlobalShortcuts } from "./useGlobalShortcuts";

function Harness() {
  useGlobalShortcuts({ onOpenPalette: () => {}, onOpenHelp: () => {} });
  return <input aria-label="search" />;
}

beforeEach(() => {
  push.mockReset();
});
afterEach(cleanup);

describe("useGlobalShortcuts", () => {
  it("AC-46: keydown g then o → push('/repos/r1/onboarding')", () => {
    render(<Harness />);
    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "o" });
    expect(push).toHaveBeenCalledWith("/repos/r1/onboarding");
  });

  it("AC-46: g o typed inside an input does nothing", () => {
    render(<Harness />);
    const input = screen.getByRole("textbox", { name: "search" });
    fireEvent.keyDown(input, { key: "g" });
    fireEvent.keyDown(input, { key: "o" });
    expect(push).not.toHaveBeenCalled();
  });
});
