import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import skills from "../../../../../../../messages/en/skills.json";
import common from "../../../../../../../messages/en/common.json";
import { ToastProvider } from "@/lib/toast";
import { ApiError } from "@/lib/api";

const createMutate = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutate: createMutate, isPending: false }),
}));

import { CreateSkillModal } from "./CreateSkillModal";

afterEach(cleanup);
beforeEach(() => {
  // Braces matter: a function returned from beforeEach runs as teardown.
  createMutate.mockReset();
});

function setup() {
  const onClose = vi.fn();
  const onCreated = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ skills, common }}>
      <ToastProvider>
        <CreateSkillModal onClose={onClose} onCreated={onCreated} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
  return { onClose, onCreated };
}

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("CreateSkillModal", () => {
  it("renders name, description, type and markdown body fields", () => {
    setup();
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Description")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByLabelText("Skill body (Markdown)")).toBeInTheDocument();
  });

  it("shows an inline kebab-case error and does not submit an invalid name", () => {
    setup();
    type("Name", "Bad Name");
    type("Skill body (Markdown)", "# Rule");
    expect(screen.getByText(/kebab-case/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("requires a body", () => {
    setup();
    type("Name", "good-name");
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    expect(screen.getByText("Body is required.")).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("shows a token estimate for the body", () => {
    setup();
    type("Skill body (Markdown)", "12345678");
    expect(screen.getByText("~2 tokens")).toBeInTheDocument();
  });

  it("submits the create payload and reports the new skill", () => {
    const { onCreated } = setup();
    const created = { id: "new1", name: "api-guard" } as Skill;
    createMutate.mockImplementation((_b: unknown, opts: { onSuccess: (s: Skill) => void }) => opts.onSuccess(created));
    type("Name", "api-guard");
    type("Description", "Checks routes");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "security" } });
    type("Skill body (Markdown)", "# Guard\nFlag breaking changes");
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    expect(createMutate).toHaveBeenCalledWith(
      { name: "api-guard", description: "Checks routes", type: "security", body: "# Guard\nFlag breaking changes" },
      expect.anything(),
    );
    expect(onCreated).toHaveBeenCalledWith(created);
  });

  it("shows 'already exists' on a 409", () => {
    setup();
    createMutate.mockImplementation((_b: unknown, opts: { onError: (e: Error) => void }) =>
      opts.onError(new ApiError("conflict", 409, "conflict")),
    );
    type("Name", "dup-name");
    type("Skill body (Markdown)", "# x");
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    expect(screen.getByText("A skill with this name already exists.")).toBeInTheDocument();
  });
});
