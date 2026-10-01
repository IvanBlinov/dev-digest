import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import common from "../../../messages/en/common.json";
import { ConfirmDialog } from "./ConfirmDialog";

afterEach(cleanup);

function setup(busy = false) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ common }}>
      <ConfirmDialog
        title="Delete skill?"
        body="pr-quality-rubric is linked to 3 agents."
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onCancel={onCancel}
        busy={busy}
      />
    </NextIntlClientProvider>,
  );
  return { onConfirm, onCancel };
}

describe("ConfirmDialog", () => {
  it("renders title and body", () => {
    setup();
    expect(screen.getByText("Delete skill?")).toBeInTheDocument();
    expect(screen.getByText("pr-quality-rubric is linked to 3 agents.")).toBeInTheDocument();
  });

  it("confirm calls onConfirm only", () => {
    const { onConfirm, onCancel } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("cancel button and the close (X) button both call onCancel", () => {
    const { onConfirm, onCancel } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("disables confirm while busy", () => {
    setup(true);
    expect(screen.getByRole("button", { name: /Delete/ })).toBeDisabled();
  });
});
