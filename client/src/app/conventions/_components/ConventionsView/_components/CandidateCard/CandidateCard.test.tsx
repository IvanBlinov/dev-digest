import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import conventions from "../../../../../../../messages/en/conventions.json";
import common from "../../../../../../../messages/en/common.json";
import { ToastProvider } from "@/lib/toast";
import { candidate, REPO_ID } from "../../test-fixtures";

const { updateMutate } = vi.hoisted(() => ({ updateMutate: vi.fn() }));
vi.mock("@/lib/hooks/conventions", () => ({
  useUpdateConvention: () => ({ mutate: updateMutate, isPending: false }),
}));

import { CandidateCard } from "./CandidateCard";
import { confidenceColor, evidenceLabel } from "./helpers";

afterEach(cleanup);
beforeEach(() => {
  updateMutate.mockReset();
});

function setup(c: ConventionCandidate = candidate()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions, common }}>
      <ToastProvider>
        <CandidateCard repoId={REPO_ID} candidate={c} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("CandidateCard", () => {
  it("renders the rule, category, evidence file with lines, snippet and confidence (req 46)", () => {
    setup();
    expect(screen.getByText(candidate().rule)).toBeInTheDocument();
    expect(screen.getByText("error handling")).toBeInTheDocument();
    expect(screen.getByText("server/src/modules/repos/routes.ts:12-18")).toBeInTheDocument();
    expect(screen.getByText("throw new NotFoundError('repo');")).toBeInTheDocument();
    expect(screen.getByText("86%")).toBeInTheDocument();
  });

  it("offers Accept, Reject and Edit (req 47)", () => {
    setup();
    for (const name of ["Accept", "Reject", "Edit"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("Accept sends status=accepted", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(updateMutate).toHaveBeenCalledWith({ id: "c1", patch: { status: "accepted" } }, expect.anything());
  });

  it("an accepted card shows 'Accepted'; clicking it again goes back to pending", () => {
    setup(candidate({ status: "accepted", accepted: true }));
    const btn = screen.getByRole("button", { name: "Accepted" });
    expect(btn).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(btn);
    expect(updateMutate).toHaveBeenCalledWith({ id: "c1", patch: { status: "pending" } }, expect.anything());
  });

  it("Reject sends status=rejected", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(updateMutate).toHaveBeenCalledWith({ id: "c1", patch: { status: "rejected" } }, expect.anything());
  });

  it("Edit turns the card into an inline form in place and saves the edited fields (req 49)", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    // Same card, now a form — the read-only rule text and the action column are gone.
    expect(screen.getByRole("form")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Rule"), { target: { value: "Handlers throw AppError" } });
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "naming" } });
    fireEvent.change(screen.getByLabelText("Start line"), { target: { value: "14" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(updateMutate).toHaveBeenCalledWith(
      {
        id: "c1",
        patch: {
          rule: "Handlers throw AppError",
          category: "naming",
          evidence_path: "server/src/modules/repos/routes.ts",
          evidence_start_line: 14,
          evidence_end_line: 18,
          evidence_snippet: "throw new NotFoundError('repo');",
        },
      },
      expect.anything(),
    );
  });

  it("closes the form after a successful save", () => {
    updateMutate.mockImplementation((_v: unknown, opts: { onSuccess: () => void }) => opts.onSuccess());
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });

  it("Cancel leaves the card unchanged without saving", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Rule"), { target: { value: "changed" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(updateMutate).not.toHaveBeenCalled();
    expect(screen.getByText(candidate().rule)).toBeInTheDocument();
  });

  it("validates the inline form before saving", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Rule"), { target: { value: "x" } });
    fireEvent.change(screen.getByLabelText("End line"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(updateMutate).not.toHaveBeenCalled();
    expect(screen.getByText("The rule needs at least 3 characters.")).toBeInTheDocument();
  });

  it("keeps the form open when the save fails", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("form")).toBeInTheDocument();
  });
});

describe("CandidateCard helpers", () => {
  it("colours confidence green ≥ 80, amber ≥ 60, else red", () => {
    expect(confidenceColor(0.8)).toBe("var(--ok)");
    expect(confidenceColor(0.6)).toBe("var(--warn)");
    expect(confidenceColor(0.59)).toBe("var(--crit)");
  });

  it("formats the evidence location", () => {
    expect(evidenceLabel(candidate())).toBe("server/src/modules/repos/routes.ts:12-18");
    expect(evidenceLabel(candidate({ evidence_end_line: 12 }))).toBe("server/src/modules/repos/routes.ts:12");
    expect(evidenceLabel(candidate({ evidence_start_line: null, evidence_end_line: null }))).toBe(
      "server/src/modules/repos/routes.ts",
    );
  });
});
