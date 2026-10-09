import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../messages/en/prReview.json";
import { SmartGroupHeader } from "./SmartGroupHeader";

afterEach(cleanup);

function renderHeader(props: Partial<React.ComponentProps<typeof SmartGroupHeader>> = {}) {
  const onToggle = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <SmartGroupHeader
        role="tests"
        fileCount={3}
        flaggedCount={2}
        reviewed
        open
        onToggle={onToggle}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return { onToggle };
}

describe("SmartGroupHeader", () => {
  it("shows label, hint, counter before the file count, and toggles on click", () => {
    const { onToggle } = renderHeader();
    const button = screen.getByRole("button", { expanded: true });
    expect(button).toHaveTextContent("Tests");
    expect(screen.getByText("Proves the change works")).toBeInTheDocument();
    const counter = screen.getByLabelText("2 files with findings");
    expect(counter).toHaveTextContent("2");
    const files = screen.getByText("3 files");
    expect(counter.compareDocumentPosition(files) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("shows no counter when no file is flagged or the PR is not reviewed", () => {
    renderHeader({ flaggedCount: 0 });
    expect(screen.queryByLabelText(/with findings/)).not.toBeInTheDocument();
    cleanup();
    renderHeader({ reviewed: false });
    expect(screen.queryByLabelText(/with findings/)).not.toBeInTheDocument();
    expect(screen.getByText("3 files")).toBeInTheDocument();
  });

  it("reflects the collapsed state", () => {
    renderHeader({ open: false });
    expect(screen.getByRole("button", { expanded: false })).toBeInTheDocument();
  });
});
