import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import skills from "../../../../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

const updateMutate = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate: updateMutate, isPending: false }),
}));

import { ConfigTab } from "./ConfigTab";

afterEach(cleanup);
beforeEach(() => {
  updateMutate.mockReset();
});

const SKILL: Skill = {
  id: "s1",
  name: "api-guard",
  description: "d",
  type: "custom",
  source: "manual",
  body: "# A",
  enabled: true,
  version: 2,
};

function setup() {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills }}>
      <ToastProvider>
        <ConfigTab skill={SKILL} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("ConfigTab", () => {
  it("shows the editor with <name>.md and no unsaved badge initially", () => {
    setup();
    expect(screen.getByText("api-guard.md")).toBeInTheDocument();
    expect(screen.queryByText("unsaved")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("marks edits as unsaved and saves only the changed fields plus the version note", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Skill body (Markdown)"), { target: { value: "# B" } });
    expect(screen.getByText("unsaved")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Version note"), { target: { value: "reword" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(updateMutate).toHaveBeenCalledWith(
      { id: "s1", patch: { body: "# B", message: "reword" } },
      expect.anything(),
    );
  });

  it("Discard restores the saved values", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Skill body (Markdown)"), { target: { value: "# B" } });
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.getByLabelText("Skill body (Markdown)")).toHaveValue("# A");
    expect(screen.queryByText("unsaved")).not.toBeInTheDocument();
  });

  it("the Enabled toggle saves immediately", () => {
    setup();
    fireEvent.click(screen.getByRole("switch"));
    expect(updateMutate).toHaveBeenCalledWith({ id: "s1", patch: { enabled: false } }, expect.anything());
  });

  it("blocks saving an invalid name", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Bad Name" } });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});
