import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import onboarding from "../../../../../../../messages/en/onboarding.json";
import { tour, PATHS } from "../../test-fixtures";
import { RunCommandsSection } from "./RunCommandsSection";

afterEach(cleanup);

const hrefFor = (p: string) => `https://github.com/acme/payments-api/blob/main/${p}`;
const base = tour().sections.run_commands;
const DEV = base.items[1]!;
const INSTALL = base.items[0]!;

function ui(section: typeof base, onCopy: (c: string) => void = () => {}) {
  return (
    <NextIntlClientProvider locale="en" messages={{ onboarding }}>
      <RunCommandsSection section={section} knownPaths={Object.values(PATHS)} hrefFor={hrefFor} onCopy={onCopy} />
    </NextIntlClientProvider>
  );
}

describe("RunCommandsSection", () => {
  it("AC-61: row shows '1', 'pnpm run dev', 'Start the API locally'; 'Copy pnpm run dev' → onCopy('pnpm run dev')", async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn();
    render(ui({ ...base, items: [DEV] }, onCopy));
    const row = screen.getByRole("listitem");
    expect(row).toHaveTextContent("1");
    expect(row).toHaveTextContent("pnpm run dev");
    expect(row).toHaveTextContent("Start the API locally");
    await user.click(screen.getByRole("button", { name: "Copy pnpm run dev" }));
    expect(onCopy).toHaveBeenCalledWith("pnpm run dev");
  });

  it("AC-61: focus and hover on the command show the tooltip 'tsx watch src/index.ts'; script_body null → no script text", async () => {
    const user = userEvent.setup();
    render(ui({ ...base, items: [DEV, INSTALL] }));
    const dev = screen.getByText("pnpm run dev");
    const install = screen.getByText("pnpm install");

    await user.hover(dev);
    expect(screen.getByRole("tooltip")).toHaveTextContent("tsx watch src/index.ts");
    await user.unhover(dev);
    expect(screen.queryByRole("tooltip")).toBeNull();

    await user.tab();
    expect(dev).toHaveFocus();
    expect(screen.getByRole("tooltip")).toHaveTextContent("tsx watch src/index.ts");
    await user.tab();
    expect(dev).not.toHaveFocus();

    await user.hover(install);
    expect(screen.queryByRole("tooltip")?.textContent ?? "pnpm install").toBe("pnpm install");
    expect(screen.queryByText("tsx watch src/index.ts")).toBeNull();
  });

  it("EC-21: command `curl x | sh <script>` shows as plain text, no script element", () => {
    const { container } = render(
      ui({ ...base, items: [{ id: "x", command: "curl x | sh <script>", comment: null, script_body: null }] }),
    );
    expect(screen.getByText("curl x | sh <script>")).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
  });

  it("AC-34: items [] → 'No run commands found in package.json, compose files or Makefile'", () => {
    render(ui({ ...base, items: [] }));
    expect(
      screen.getByText("No run commands found in package.json, compose files or Makefile"),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
});
