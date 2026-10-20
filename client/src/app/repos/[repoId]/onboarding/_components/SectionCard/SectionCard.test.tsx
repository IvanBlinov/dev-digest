import type { ComponentProps } from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import onboarding from "../../../../../../../messages/en/onboarding.json";
import { SectionCard } from "./SectionCard";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

type Props = Partial<ComponentProps<typeof SectionCard>>;

function ui(props: Props = {}) {
  return (
    <NextIntlClientProvider locale="en" messages={{ onboarding }}>
      <SectionCard
        anchor="critical-paths"
        title="Critical paths"
        source="llm"
        unavailableReason={null}
        {...props}
      >
        <p>card body</p>
      </SectionCard>
    </NextIntlClientProvider>
  );
}

describe("SectionCard", () => {
  it("AC-56: expanded by default; click collapses and removes the body; Enter and Space toggle on the focused button", async () => {
    const user = userEvent.setup();
    render(ui());
    const btn = screen.getByRole("button", { name: "Collapse Critical paths" });
    expect(btn).toHaveAttribute("aria-expanded", "true");
    expect(btn).toHaveAttribute("aria-controls");
    expect(screen.getByText("card body")).toBeInTheDocument();

    await user.click(btn);
    const expand = screen.getByRole("button", { name: "Expand Critical paths" });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("card body")).toBeNull();

    expand.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Collapse Critical paths" })).toHaveAttribute("aria-expanded", "true");
    await user.keyboard(" ");
    expect(screen.getByRole("button", { name: "Expand Critical paths" })).toHaveAttribute("aria-expanded", "false");
  });

  it("AC-56 / NFR-7: the accessible name flips 'Collapse Critical paths' → 'Expand Critical paths'", async () => {
    const user = userEvent.setup();
    render(ui());
    expect(screen.getByRole("button", { name: "Collapse Critical paths" })).toBeInTheDocument();
    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("button", { name: "Expand Critical paths" })).toBeInTheDocument();
  });

  it("AC-56: a remount is expanded again; no localStorage write", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const user = userEvent.setup();
    const first = render(ui());
    await user.click(screen.getByRole("button", { name: "Collapse Critical paths" }));
    expect(screen.queryByText("card body")).toBeNull();
    first.unmount();

    render(ui());
    expect(screen.getByRole("button", { name: "Collapse Critical paths" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("card body")).toBeInTheDocument();
    expect(setItem).not.toHaveBeenCalled();
  });

  it("AC-59: deterministic → 'Deterministic' chip; llm → no chip", () => {
    const first = render(ui({ source: "deterministic" }));
    expect(screen.getByText("Deterministic")).toBeInTheDocument();
    first.unmount();
    render(ui({ source: "llm" }));
    expect(screen.queryByText("Deterministic")).toBeNull();
  });

  it("AC-59: index_degraded → 'Unavailable: Index unavailable'", () => {
    render(ui({ unavailableReason: "index_degraded" }));
    expect(screen.getByText("Unavailable: Index unavailable")).toBeInTheDocument();
  });

  it("AC-55: the section has id = anchor and a level-2 heading with the title", () => {
    render(ui());
    expect(screen.getByRole("region", { name: "Critical paths" })).toHaveAttribute("id", "critical-paths");
    expect(screen.getByRole("heading", { level: 2, name: "Critical paths" })).toBeInTheDocument();
  });
});
