import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import conventions from "../../../../../../../../../messages/en/conventions.json";
import { ToastProvider } from "@/lib/toast";
import { EvidenceBlock } from "./EvidenceBlock";

afterEach(cleanup);

function setup() {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions }}>
      <ToastProvider>
        <EvidenceBlock location="src/a.ts:3-4" snippet={"const a = 1;\nconst b = 2;"} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("EvidenceBlock", () => {
  it("shows the location and the snippet", () => {
    setup();
    expect(screen.getByText("src/a.ts:3-4")).toBeInTheDocument();
    expect(screen.getByTestId("evidence-snippet").textContent).toBe("const a = 1;\nconst b = 2;");
  });

  it("copies the snippet to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Copy snippet" }));
    expect(writeText).toHaveBeenCalledWith("const a = 1;\nconst b = 2;");
    await waitFor(() => expect(screen.getByText("Snippet copied")).toBeInTheDocument());
  });
});
