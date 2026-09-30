import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import skills from "../../../../../../../../messages/en/skills.json";
import { PreviewTab } from "./PreviewTab";

afterEach(cleanup);

const renderTab = (body: string) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ skills }}>
      <PreviewTab body={body} />
    </NextIntlClientProvider>,
  );

describe("PreviewTab", () => {
  it("renders markdown with the caption", () => {
    renderTab("## Checks\n\n- one");
    expect(screen.getByText("Rendered as the reviewing agent receives it.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Checks" })).toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveTextContent("one");
  });

  it("shows a placeholder for an empty body", () => {
    renderTab("");
    expect(screen.getByText("This skill has no body yet.")).toBeInTheDocument();
  });
});
