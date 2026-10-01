import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillVersion } from "@devdigest/shared";
import skills from "../../../../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

const restoreMutate = vi.fn();
const VERSIONS: SkillVersion[] = [
  { version: 3, body: "# Rule\nnew line\nkeep", message: "Tightened wording", created_at: "2026-09-29T10:00:00Z" },
  { version: 2, body: "# Rule\nold line\nkeep", message: null, created_at: "2026-09-28T10:00:00Z" },
  { version: 1, body: "# Rule", message: "Initial version", created_at: "2026-09-27T10:00:00Z" },
];
vi.mock("@/lib/hooks/skills", () => ({
  useSkillVersions: () => ({ data: VERSIONS, isLoading: false, isError: false, refetch: vi.fn() }),
  useRestoreSkillVersion: () => ({ mutate: restoreMutate, isPending: false }),
}));

import { VersioningTab } from "./VersioningTab";

afterEach(cleanup);
beforeEach(() => {
  restoreMutate.mockReset();
});

const SKILL = { id: "s1", name: "x-y", body: "# Rule\nnew line\nkeep", version: 3 } as Skill;

function setup() {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills }}>
      <ToastProvider>
        <VersioningTab skill={SKILL} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("VersioningTab", () => {
  it("lists every version with its message, marking the current one", () => {
    setup();
    expect(screen.getByText("Version history · 3 versions")).toBeInTheDocument();
    expect(screen.getByText("v3")).toBeInTheDocument();
    expect(screen.getByText("Tightened wording")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("Initial version")).toBeInTheDocument();
    expect(screen.getAllByText("● Current")).toHaveLength(1);
  });

  it("offers Diff and Restore only on older versions", () => {
    setup();
    expect(screen.getAllByRole("button", { name: "Diff" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Restore" })).toHaveLength(2);
  });

  it("Diff shows an inline line diff against the current body", () => {
    setup();
    fireEvent.click(screen.getAllByRole("button", { name: "Diff" })[0]!);
    expect(screen.getByText("- old line")).toBeInTheDocument();
    expect(screen.getByText("+ new line")).toBeInTheDocument();
    expect(screen.getByText("v2 → current (v3) · +1 −1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hide diff" }));
    expect(screen.queryByText("- old line")).not.toBeInTheDocument();
  });

  it("Restore calls the restore mutation for that version", () => {
    setup();
    fireEvent.click(screen.getAllByRole("button", { name: "Restore" })[1]!);
    expect(restoreMutate).toHaveBeenCalledWith({ id: "s1", version: 1 }, expect.anything());
  });
});
