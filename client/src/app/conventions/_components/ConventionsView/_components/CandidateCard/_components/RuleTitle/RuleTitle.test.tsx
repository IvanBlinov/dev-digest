import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import conventions from "../../../../../../../../../messages/en/conventions.json";
import { RuleTitle } from "./RuleTitle";
import { ruleTitleError } from "./helpers";

afterEach(cleanup);

const RULE = "Wrap fetch calls and throw ApiError on network failures";

function setup(onSave = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions }}>
      <RuleTitle rule={RULE} onSave={onSave} />
    </NextIntlClientProvider>,
  );
  return { onSave };
}

const openEditor = () => fireEvent.click(screen.getByRole("button", { name: /edit convention title/i }));
const field = () => screen.getByRole("textbox", { name: /convention title/i });

describe("RuleTitle — click the convention title to rename it", () => {
  it("shows the rule as a clickable title", () => {
    setup();
    expect(screen.getByRole("button", { name: /edit convention title/i })).toHaveTextContent(RULE);
  });

  it("clicking the title turns it into an editable field with the current text", () => {
    setup();
    openEditor();
    expect(field()).toHaveValue(RULE);
    expect(field()).toHaveFocus();
  });

  it("Enter saves the trimmed new title and leaves edit mode", () => {
    const { onSave } = setup();
    openEditor();
    fireEvent.change(field(), { target: { value: "  Always throw ApiError from apiFetch  " } });
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(onSave).toHaveBeenCalledWith("Always throw ApiError from apiFetch");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("blur saves too", () => {
    const { onSave } = setup();
    openEditor();
    fireEvent.change(field(), { target: { value: "Renamed on blur" } });
    fireEvent.blur(field());
    expect(onSave).toHaveBeenCalledWith("Renamed on blur");
  });

  it("Escape cancels without saving and restores the title", () => {
    const { onSave } = setup();
    openEditor();
    fireEvent.change(field(), { target: { value: "Discard me" } });
    fireEvent.keyDown(field(), { key: "Escape" });
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /edit convention title/i })).toHaveTextContent(RULE);
  });

  it("an unchanged title closes the field without a request", () => {
    const { onSave } = setup();
    openEditor();
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("a too-short title shows an error on Enter and keeps editing", () => {
    const { onSave } = setup();
    openEditor();
    fireEvent.change(field(), { target: { value: "ab" } });
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/at least 3/i);
    expect(field()).toBeInTheDocument();
  });

  it("blur with an invalid title reverts instead of saving", () => {
    const { onSave } = setup();
    openEditor();
    fireEvent.change(field(), { target: { value: " " } });
    fireEvent.blur(field());
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /edit convention title/i })).toHaveTextContent(RULE);
  });

  it("Shift+Enter does not save (new line)", () => {
    const { onSave } = setup();
    openEditor();
    fireEvent.change(field(), { target: { value: "Multi" } });
    fireEvent.keyDown(field(), { key: "Enter", shiftKey: true });
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("ruleTitleError", () => {
  it("validates length like the contract (3–300 chars, trimmed)", () => {
    expect(ruleTitleError("ab")).toBe("tooShort");
    expect(ruleTitleError("   abc   ")).toBeNull();
    expect(ruleTitleError("x".repeat(301))).toBe("tooLong");
  });
});
