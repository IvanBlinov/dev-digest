import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import onboarding from "../../../../../../../messages/en/onboarding.json";
import { fileHref } from "../../helpers";
import { REPO, tour, PATHS } from "../../test-fixtures";
import { CriticalPathsSection } from "./CriticalPathsSection";

afterEach(cleanup);

const hrefFor = (p: string) => fileHref(REPO, null, p);
const base = tour().sections.critical_paths;

function ui(section: typeof base) {
  return (
    <NextIntlClientProvider locale="en" messages={{ onboarding }}>
      <CriticalPathsSection section={section} knownPaths={Object.values(PATHS)} hrefFor={hrefFor} />
    </NextIntlClientProvider>
  );
}

describe("CriticalPathsSection", () => {
  it("AC-60: Open link href = fileHref(…), target _blank, rel 'noopener noreferrer', name 'Open src/middleware/ratelimit.ts'", () => {
    render(ui(base));
    const link = screen.getByRole("link", { name: "Open src/middleware/ratelimit.ts" });
    expect(link).toHaveAttribute("href", fileHref(REPO, null, PATHS.ratelimit));
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("imported by 2 files")).toBeInTheDocument();
    expect(screen.getByText("Guards every public route")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /^Open / })).toHaveLength(2);
  });

  it("AC-31: reason null → path and fact only", () => {
    render(ui({ ...base, items: [{ path: PATHS.config, fact: "imported by 7 files", reason: null }] }));
    const row = screen.getByRole("listitem");
    expect(row).toHaveTextContent(PATHS.config);
    expect(row).toHaveTextContent("imported by 7 files");
    expect(row).not.toHaveTextContent("null");
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("AC-67: a path containing `<b>` is literal text", () => {
    const { container } = render(
      ui({ ...base, items: [{ path: "src/<b>x</b>.ts", fact: "imported by 1 file", reason: null }] }),
    );
    expect(screen.getByText("src/<b>x</b>.ts")).toBeInTheDocument();
    expect(container.querySelector("b")).toBeNull();
  });
});
