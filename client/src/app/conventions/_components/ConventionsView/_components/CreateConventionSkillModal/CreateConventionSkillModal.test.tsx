import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, ConventionSkillDraft, CreateConventionSkillResult } from "@devdigest/shared";
import conventions from "../../../../../../../messages/en/conventions.json";
import common from "../../../../../../../messages/en/common.json";
import { ToastProvider } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { REPO_ID } from "../../test-fixtures";

const GENERAL = "22222222-2222-4222-8222-222222222222";
const API_AGENT = "33333333-3333-4333-8333-333333333333";
const IDS = ["44444444-4444-4444-8444-444444444444", "55555555-5555-4555-8555-555555555555"];

const DRAFT: ConventionSkillDraft = {
  name: "repo-conventions",
  description: "House conventions for IvanBlinov/dev-digest",
  type: "convention",
  body: "# repo-conventions\n\nHouse conventions.\n\n## typed-errors\nThrow AppError.",
};

const h = vi.hoisted(() => ({
  createMutate: vi.fn(),
  draft: { data: undefined as unknown, isLoading: false, isError: false, error: null as Error | null, refetch: vi.fn() },
  agents: [] as unknown[],
}));
vi.mock("@/lib/hooks/conventions", () => ({
  useConventionSkillDraft: () => h.draft,
  useCreateConventionSkill: () => ({ mutate: h.createMutate, isPending: false }),
}));
vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({ data: h.agents, isLoading: false }),
}));

import { CreateConventionSkillModal } from "./CreateConventionSkillModal";

const agent = (id: string, name: string) => ({ id, name }) as Agent;

afterEach(cleanup);
beforeEach(() => {
  h.createMutate.mockReset();
  h.draft = { data: DRAFT, isLoading: false, isError: false, error: null, refetch: vi.fn() };
  h.agents = [agent(API_AGENT, "API Contract Reviewer"), agent(GENERAL, "General Reviewer")];
});

function setup() {
  const onClose = vi.fn();
  const onCreated = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions, common }}>
      <ToastProvider>
        <CreateConventionSkillModal
          repoId={REPO_ID}
          repoName="IvanBlinov/dev-digest"
          candidateIds={IDS}
          onClose={onClose}
          onCreated={onCreated}
        />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
  return { onClose, onCreated };
}

const submit = () => fireEvent.click(screen.getByRole("button", { name: "Create skill" }));

describe("CreateConventionSkillModal", () => {
  it("explains it is built from conventions and prefills every field from the draft (req 41, 51)", () => {
    setup();
    expect(screen.getByText("Create skill from conventions")).toBeInTheDocument();
    expect(screen.getByText(/Merged from 2 accepted conventions in/)).toBeInTheDocument();
    expect(screen.getByText("IvanBlinov/dev-digest")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("repo-conventions");
    expect(screen.getByLabelText("Description")).toHaveValue(DRAFT.description);
    expect(screen.getByDisplayValue("convention")).toBeInTheDocument();
    expect(screen.getByLabelText("Skill body")).toHaveValue(DRAFT.body);
    expect(screen.getByText("repo-conventions.md")).toBeInTheDocument();
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Saved as v1 · added to Skills Lab")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("subtitle follows the current name", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "house-rules" } });
    expect(screen.getAllByText("house-rules").length).toBeGreaterThan(0);
    expect(screen.getByText("house-rules.md")).toBeInTheDocument();
  });

  it("the body is editable and marked unsaved once changed", () => {
    setup();
    expect(screen.queryByText("unsaved")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Skill body"), { target: { value: "# custom" } });
    expect(screen.getByLabelText("Skill body")).toHaveValue("# custom");
    expect(screen.getByText("unsaved")).toBeInTheDocument();
  });

  it("defaults Attach to agent to General Reviewer and offers Don't link", () => {
    setup();
    expect(screen.getByDisplayValue("General Reviewer")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Don't link" })).toBeInTheDocument();
  });

  it("submits the full payload with the chosen agent", () => {
    const { onCreated } = setup();
    const result = { skill: { id: "sk1", name: "repo-conventions" }, linked_agent_id: GENERAL } as CreateConventionSkillResult;
    h.createMutate.mockImplementation((_b: unknown, opts: { onSuccess: (r: CreateConventionSkillResult) => void }) =>
      opts.onSuccess(result),
    );
    fireEvent.change(screen.getByLabelText("Skill body"), { target: { value: "# edited" } });
    fireEvent.click(screen.getByRole("switch"));
    submit();
    expect(h.createMutate).toHaveBeenCalledWith(
      {
        candidate_ids: IDS,
        name: "repo-conventions",
        description: DRAFT.description,
        type: "convention",
        enabled: false,
        body: "# edited",
        agent_id: GENERAL,
      },
      expect.anything(),
    );
    expect(onCreated).toHaveBeenCalledWith(result);
  });

  it("sends agent_id=null for Don't link", () => {
    setup();
    fireEvent.change(screen.getByDisplayValue("General Reviewer"), { target: { value: "" } });
    submit();
    expect(h.createMutate).toHaveBeenCalledWith(expect.objectContaining({ agent_id: null }), expect.anything());
  });

  it("defaults to Don't link when there is no General Reviewer", () => {
    h.agents = [agent(API_AGENT, "API Contract Reviewer")];
    setup();
    submit();
    expect(h.createMutate).toHaveBeenCalledWith(expect.objectContaining({ agent_id: null }), expect.anything());
  });

  it("blocks an invalid name and an empty body", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Bad Name" } });
    fireEvent.change(screen.getByLabelText("Skill body"), { target: { value: "  " } });
    submit();
    expect(h.createMutate).not.toHaveBeenCalled();
    expect(screen.getByText(/Use kebab-case/)).toBeInTheDocument();
    expect(screen.getByText("Body is required.")).toBeInTheDocument();
  });

  it("shows 'already exists' inline on a 409", () => {
    h.createMutate.mockImplementation((_b: unknown, opts: { onError: (e: Error) => void }) =>
      opts.onError(new ApiError("conflict", 409, "conflict")),
    );
    setup();
    submit();
    expect(screen.getByText("A skill with this name already exists.")).toBeInTheDocument();
  });

  it("shows a loading state while the draft is built", () => {
    h.draft = { data: undefined, isLoading: true, isError: false, error: null, refetch: vi.fn() };
    setup();
    expect(screen.getByText("Building the skill draft…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create skill" })).toBeDisabled();
  });

  it("shows the draft error with a retry", () => {
    const refetch = vi.fn();
    h.draft = { data: undefined, isLoading: false, isError: true, error: new Error("nope"), refetch };
    setup();
    expect(screen.getByText("Could not build the skill draft: nope")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("Cancel closes without saving", () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(h.createMutate).not.toHaveBeenCalled();
  });
});
