import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import onboarding from "../../../../../../../messages/en/onboarding.json";
import { fileHref } from "../../helpers";
import { REPO, tour, PATHS } from "../../test-fixtures";
import { FirstTasksSection } from "./FirstTasksSection";

afterEach(cleanup);

const hrefFor = (p: string) => fileHref(REPO, null, p);
const base = tour().sections.first_tasks;

function ui(section: typeof base) {
  return (
    <NextIntlClientProvider locale="en" messages={{ onboarding }}>
      <FirstTasksSection section={section} knownPaths={Object.values(PATHS)} hrefFor={hrefFor} />
    </NextIntlClientProvider>
  );
}

describe("FirstTasksSection", () => {
  it("AC-63: title, description, and path links to fileHref with name 'Open src/api/users.ts'", () => {
    render(ui(base));
    expect(screen.getByText("Add a test for the users endpoint")).toBeInTheDocument();
    expect(screen.getByText("Cover the validation error path of the users handler.")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Open src/api/users.ts" });
    expect(link).toHaveAttribute("href", fileHref(REPO, null, PATHS.users));
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveTextContent("src/api/users.ts");
  });

  it("AC-40: a path not in knownPaths is plain text", () => {
    render(
      ui({
        ...base,
        items: [{ title: "Tidy up", description: "Remove dead code.", paths: ["src/ghost.ts"] }],
      }),
    );
    expect(screen.getByText("src/ghost.ts")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("AC-39: items [] → 'First tasks are written by the narrative step — Regenerate to try again'", () => {
    render(ui({ ...base, items: [] }));
    expect(
      screen.getByText("First tasks are written by the narrative step — Regenerate to try again"),
    ).toBeInTheDocument();
  });
});
