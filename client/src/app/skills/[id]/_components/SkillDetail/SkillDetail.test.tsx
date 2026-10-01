import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import skills from "../../../../../../messages/en/skills.json";
import common from "../../../../../../messages/en/common.json";
import { ToastProvider } from "@/lib/toast";

const SKILL: Skill = {
  id: "s1",
  name: "api-contract-guard",
  description: "Breaking changes",
  type: "security",
  source: "imported",
  body: "# Guard\n\nFlag **removed** routes.",
  enabled: true,
  version: 5,
  agent_count: 1,
};

vi.mock("@/lib/hooks/skills", () => ({
  useSkill: () => ({ data: SKILL, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useSkillVersions: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useRestoreSkillVersion: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { SkillDetail } from "./SkillDetail";

afterEach(cleanup);

function setup() {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills, common }}>
      <ToastProvider>
        <SkillDetail id="s1" />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("SkillDetail", () => {
  it("shows the header: name, type chip and version", () => {
    setup();
    const heading = screen.getByRole("heading", { name: "api-contract-guard" });
    const header = within(heading.parentElement!);
    expect(header.getByText("security")).toBeInTheDocument();
    expect(header.getByText("v5")).toBeInTheDocument();
  });

  it("has exactly three tabs: Config, Preview, Versioning", () => {
    setup();
    const tabs = within(screen.getByRole("navigation", { name: "Skill sections" })).getAllByRole("button");
    expect(tabs.map((b) => b.textContent)).toEqual(["Config", "Preview", "Versioning"]);
  });

  it("opens on Config", () => {
    setup();
    expect(screen.getByLabelText("Skill body (Markdown)")).toHaveValue(SKILL.body);
  });

  it("Preview renders the markdown, not the raw text", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByText("Rendered as the reviewing agent receives it.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Guard" })).toBeInTheDocument();
    expect(screen.queryByText(/# Guard/)).not.toBeInTheDocument();
    expect(screen.getByText("removed").tagName).toBe("STRONG");
  });

  it("Versioning tab shows the history panel", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Versioning" }));
    expect(screen.getByText("No versions yet.")).toBeInTheDocument();
  });
});
