import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import onboarding from "../../../../../../../messages/en/onboarding.json";
import { diagramToMermaid } from "../../helpers";
import { tour, PATHS } from "../../test-fixtures";
import { ArchitectureSection } from "./ArchitectureSection";

vi.mock("@/components/mermaid-diagram", () => ({
  MermaidDiagram: ({ chart }: { chart: string }) => <pre aria-label="diagram">{chart}</pre>,
}));

afterEach(cleanup);

const hrefFor = (p: string) => `https://github.com/acme/payments-api/blob/main/${p}`;
const base = tour().sections.architecture;

function ui(section: typeof base) {
  return (
    <NextIntlClientProvider locale="en" messages={{ onboarding }}>
      <ArchitectureSection section={section} knownPaths={Object.values(PATHS)} hrefFor={hrefFor} />
    </NextIntlClientProvider>
  );
}

describe("ArchitectureSection", () => {
  it("AC-27: narrative rendered (**x** → strong)", () => {
    render(ui({ ...base, narrative: "The **gateway** fronts everything." }));
    expect(screen.getByText("gateway").tagName).toBe("STRONG");
  });

  it("AC-28: MermaidDiagram receives diagramToMermaid(diagram)", () => {
    render(ui(base));
    expect(screen.getByLabelText("diagram")).toHaveTextContent(/^graph LR/);
    expect(screen.getByLabelText("diagram").textContent).toBe(diagramToMermaid(base.diagram!));
  });

  it("AC-29: diagram null + no_graph → 'Diagram unavailable' and 'No import graph'; MermaidDiagram not rendered", () => {
    render(ui({ ...base, diagram: null, unavailable_reason: "no_graph" }));
    expect(screen.getByText("Diagram unavailable")).toBeInTheDocument();
    expect(screen.getByText(/No import graph/)).toBeInTheDocument();
    expect(screen.queryByLabelText("diagram")).toBeNull();
  });

  it("AC-67: narrative `<img src=x onerror=alert(1)>` → no img", () => {
    const { container } = render(ui({ ...base, narrative: "Look <img src=x onerror=alert(1)> here" }));
    expect(container.querySelector("img")).toBeNull();
  });
});
