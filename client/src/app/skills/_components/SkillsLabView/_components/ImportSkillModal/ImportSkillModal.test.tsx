import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillImportPreview } from "@devdigest/shared";
import skills from "../../../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

const previewMutate = vi.fn();
const importMutate = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  usePreviewSkillImport: () => ({ mutate: previewMutate, isPending: false }),
  useImportSkill: () => ({ mutate: importMutate, isPending: false }),
}));

import { ImportSkillModal } from "./ImportSkillModal";

afterEach(cleanup);
beforeEach(() => {
  previewMutate.mockReset();
  importMutate.mockReset();
});

const PREVIEW: SkillImportPreview = {
  name: "api-contract-guard",
  description: "Detect breaking API changes",
  type: "security",
  body: "# API contract guard\n\nFlag removed routes.",
  source_file: "api-contract-guard/SKILL.md",
  ignored_files: ["api-contract-guard/scripts/check.sh", "api-contract-guard/logo.png"],
  warnings: ["Ignored 2 non-markdown entries"],
};

function setup() {
  const onClose = vi.fn();
  const onImported = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ skills }}>
      <ToastProvider>
        <ImportSkillModal onClose={onClose} onImported={onImported} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
  return { onClose, onImported };
}

const upload = (file: File) =>
  fireEvent.change(screen.getByLabelText("Skill file (.md or .zip)"), { target: { files: [file] } });

describe("ImportSkillModal", () => {
  it("rejects unsupported extensions client-side", () => {
    setup();
    upload(new File(["x"], "skill.tar.gz"));
    expect(screen.getByText("Only .md and .zip files are supported.")).toBeInTheDocument();
    expect(previewMutate).not.toHaveBeenCalled();
  });

  it("previews the parsed core: editable fields, rendered body, source file, ignored files, warnings", async () => {
    previewMutate.mockImplementation((_b: unknown, opts: { onSuccess: (p: SkillImportPreview) => void }) =>
      opts.onSuccess(PREVIEW),
    );
    setup();
    upload(new File(["zipbytes"], "guard.zip"));
    expect(await screen.findByDisplayValue("api-contract-guard")).toBeInTheDocument();
    expect(previewMutate).toHaveBeenCalledWith(
      { filename: "guard.zip", content_base64: btoa("zipbytes") },
      expect.anything(),
    );
    expect(screen.getByDisplayValue("Detect breaking API changes")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("security");
    expect(screen.getByRole("heading", { name: "API contract guard" })).toBeInTheDocument();
    expect(screen.getByText("api-contract-guard/SKILL.md")).toBeInTheDocument();
    expect(screen.getByText("api-contract-guard/scripts/check.sh")).toBeInTheDocument();
    expect(screen.getByText("api-contract-guard/logo.png")).toBeInTheDocument();
    expect(screen.getByText("Ignored 2 non-markdown entries")).toBeInTheDocument();
  });

  it("saves with the upload plus edits", async () => {
    previewMutate.mockImplementation((_b: unknown, opts: { onSuccess: (p: SkillImportPreview) => void }) =>
      opts.onSuccess(PREVIEW),
    );
    const saved = { id: "s9", name: "api-guard" } as Skill;
    importMutate.mockImplementation((_b: unknown, opts: { onSuccess: (s: Skill) => void }) => opts.onSuccess(saved));
    const { onImported } = setup();
    upload(new File(["# md"], "guard.md"));
    const name = await screen.findByDisplayValue("api-contract-guard");
    fireEvent.change(name, { target: { value: "api-guard" } });
    fireEvent.click(screen.getByRole("button", { name: "Save skill" }));
    expect(importMutate).toHaveBeenCalledWith(
      {
        filename: "guard.md",
        content_base64: btoa("# md"),
        name: "api-guard",
        description: "Detect breaking API changes",
        type: "security",
      },
      expect.anything(),
    );
    expect(onImported).toHaveBeenCalledWith(saved);
  });

  it("shows a preview error inline", async () => {
    previewMutate.mockImplementation((_b: unknown, opts: { onError: (e: Error) => void }) =>
      opts.onError(new Error("No markdown file found")),
    );
    setup();
    upload(new File(["x"], "empty.zip"));
    expect(await screen.findByText(/No markdown file found/)).toBeInTheDocument();
  });
});
