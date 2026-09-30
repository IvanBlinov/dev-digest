import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import skills from "../../../../../messages/en/skills.json";
import { SkillFields } from "./SkillFields";

afterEach(cleanup);

const VALUE = { name: "a-b", description: "d", type: "custom" as const };

function setup(nameError: string | null = null) {
  const onChange = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ skills }}>
      <SkillFields value={VALUE} onChange={onChange} nameError={nameError} />
    </NextIntlClientProvider>,
  );
  return { onChange };
}

describe("SkillFields", () => {
  it("emits an immutable update per field", () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "x-y" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...VALUE, name: "x-y" });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "rubric" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...VALUE, type: "rubric" });
  });

  it("renders the name error as an alert", () => {
    setup("Bad name");
    expect(screen.getByRole("alert")).toHaveTextContent("Bad name");
  });
});

import { nameErrorKey } from "./helpers";

describe("nameErrorKey", () => {
  it("shows format errors while typing, required only after submit, taken for the 409 name", () => {
    expect(nameErrorKey("Bad Name", { submitted: false })).toBe("form.nameInvalid");
    expect(nameErrorKey("", { submitted: false })).toBeNull();
    expect(nameErrorKey("", { submitted: true })).toBe("form.nameRequired");
    expect(nameErrorKey("dup", { submitted: true, takenName: "dup" })).toBe("form.nameTaken");
    expect(nameErrorKey("dup-2", { submitted: true, takenName: "dup" })).toBeNull();
  });
});
