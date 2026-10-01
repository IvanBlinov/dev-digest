import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import conventions from "../../../../../../../../../messages/en/conventions.json";
import { candidate } from "../../../../test-fixtures";
import { CandidateEditForm } from "./CandidateEditForm";
import { toPatch, validateDraft } from "./helpers";

afterEach(cleanup);

function setup() {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions }}>
      <CandidateEditForm candidate={candidate()} onSave={onSave} onCancel={onCancel} />
    </NextIntlClientProvider>,
  );
  return { onSave, onCancel };
}

describe("CandidateEditForm", () => {
  it("prefills every editable field from the candidate", () => {
    setup();
    expect(screen.getByLabelText("Rule")).toHaveValue(candidate().rule);
    expect(screen.getByLabelText("Category")).toHaveValue("error-handling");
    expect(screen.getByLabelText("Evidence file")).toHaveValue("server/src/modules/repos/routes.ts");
    expect(screen.getByLabelText("Start line")).toHaveValue("12");
    expect(screen.getByLabelText("End line")).toHaveValue("18");
    expect(screen.getByLabelText("Snippet")).toHaveValue("throw new NotFoundError('repo');");
  });

  it("saves the edited snippet and path; empty lines become null", () => {
    const { onSave } = setup();
    fireEvent.change(screen.getByLabelText("Evidence file"), { target: { value: "src/x.ts" } });
    fireEvent.change(screen.getByLabelText("Start line"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("End line"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Snippet"), { target: { value: "y()" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ evidence_path: "src/x.ts", evidence_start_line: null, evidence_end_line: null, evidence_snippet: "y()" }),
    );
  });

  it("Cancel calls onCancel", () => {
    const { onCancel, onSave } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("CandidateEditForm helpers", () => {
  const base = { rule: "abc", category: "naming" as const, path: "a.ts", start: "1", end: "2", snippet: "" };
  it("validates rule, path and line range", () => {
    expect(validateDraft(base)).toEqual([]);
    expect(validateDraft({ ...base, rule: " a " })).toContain("ruleTooShort");
    expect(validateDraft({ ...base, path: " " })).toContain("pathRequired");
    expect(validateDraft({ ...base, start: "5", end: "2" })).toContain("linesInvalid");
    expect(validateDraft({ ...base, start: "0" })).toContain("linesInvalid");
    expect(validateDraft({ ...base, start: "1.5" })).toContain("linesInvalid");
  });

  it("builds a trimmed patch", () => {
    expect(toPatch({ ...base, rule: " abc ", path: " a.ts ", start: "", end: "" })).toEqual({
      rule: "abc",
      category: "naming",
      evidence_path: "a.ts",
      evidence_start_line: null,
      evidence_end_line: null,
      evidence_snippet: "",
    });
  });
});
