import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillImportPreview } from "@devdigest/shared";
import skills from "../../../../../../../messages/en/skills.json";
import { ImportPreview } from "./ImportPreview";

afterEach(cleanup);

const PREVIEW: SkillImportPreview = {
  name: "guard",
  description: "Guards",
  type: "rubric",
  body: "# Guard rule",
  source_file: "guard.md",
  ignored_files: ["logo.png"],
  warnings: ["Heads up"],
};

function setup(preview: SkillImportPreview = PREVIEW, nameError: string | null = null) {
  const onMetaChange = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ skills }}>
      <ImportPreview
        preview={preview}
        meta={{ name: preview.name, description: preview.description, type: preview.type }}
        onMetaChange={onMetaChange}
        nameError={nameError}
        sourceLabel="Origin"
        sourceValue="https://example.com/guard.md"
      />
    </NextIntlClientProvider>,
  );
  return { onMetaChange };
}

describe("ImportPreview", () => {
  it("renders fields, source, body, ignored files and warnings", () => {
    setup();
    expect(screen.getByDisplayValue("guard")).toBeInTheDocument();
    expect(screen.getByText("Origin")).toBeInTheDocument();
    expect(screen.getByText("https://example.com/guard.md")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Guard rule" })).toBeInTheDocument();
    expect(screen.getByText("logo.png")).toBeInTheDocument();
    expect(screen.getByText("Heads up")).toBeInTheDocument();
  });

  it("propagates edits and shows the name error", () => {
    const { onMetaChange } = setup(PREVIEW, "Taken");
    fireEvent.change(screen.getByDisplayValue("guard"), { target: { value: "guard-2" } });
    expect(onMetaChange).toHaveBeenCalledWith({ name: "guard-2", description: "Guards", type: "rubric" });
    expect(screen.getByText("Taken")).toBeInTheDocument();
  });

  it("shows the injection block only when blocked", () => {
    setup({ ...PREVIEW, security: { status: "blocked", findings: [] } });
    expect(screen.getByRole("region", { name: "Prompt injection detected" })).toBeInTheDocument();
    cleanup();
    setup({ ...PREVIEW, security: { status: "clean", findings: [] } });
    expect(screen.queryByRole("region", { name: "Prompt injection detected" })).not.toBeInTheDocument();
  });
});
