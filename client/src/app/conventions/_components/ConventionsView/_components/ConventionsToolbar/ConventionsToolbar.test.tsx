import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import conventions from "../../../../../../../messages/en/conventions.json";
import { ConventionsToolbar } from "./ConventionsToolbar";

afterEach(cleanup);

function setup(accepted: number, total = 5) {
  const onDeselectAll = vi.fn();
  const onCreateSkill = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions }}>
      <ConventionsToolbar accepted={accepted} total={total} onDeselectAll={onDeselectAll} onCreateSkill={onCreateSkill} />
    </NextIntlClientProvider>,
  );
  return { onDeselectAll, onCreateSkill };
}

describe("ConventionsToolbar", () => {
  it("hides Create skill while nothing is accepted (req 50)", () => {
    setup(0);
    expect(screen.getByText("0 of 5 accepted")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create skill" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deselect all" })).toBeDisabled();
  });

  it("shows Create skill once at least one is accepted", () => {
    const { onCreateSkill } = setup(2);
    expect(screen.getByText("2 of 5 accepted")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    expect(onCreateSkill).toHaveBeenCalled();
  });

  it("Deselect all calls back", () => {
    const { onDeselectAll } = setup(3);
    fireEvent.click(screen.getByRole("button", { name: "Deselect all" }));
    expect(onDeselectAll).toHaveBeenCalled();
  });
});
