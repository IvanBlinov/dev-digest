import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import onboarding from "../../../../../../../messages/en/onboarding.json";
import { tour, PATHS } from "../../test-fixtures";
import { ReadingPathSection } from "./ReadingPathSection";

afterEach(cleanup);

const hrefFor = (p: string) => `https://github.com/acme/payments-api/blob/main/${p}`;
const base = tour().sections.reading_path;

function ui(section: typeof base) {
  return (
    <NextIntlClientProvider locale="en" messages={{ onboarding }}>
      <ReadingPathSection section={section} knownPaths={Object.values(PATHS)} hrefFor={hrefFor} />
    </NextIntlClientProvider>
  );
}

describe("ReadingPathSection", () => {
  it("AC-62: rows 1..n in the given order with path and why", () => {
    render(ui(base));
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    const expected = [
      [PATHS.config, "Where settings and limits are defined"],
      [PATHS.ratelimit, "The middleware every public route shares"],
      [PATHS.publicIndex, "Wires the public routes together"],
    ] as const;
    expected.forEach(([path, why], i) => {
      expect(rows[i]).toHaveTextContent(String(i + 1));
      expect(rows[i]).toHaveTextContent(path);
      expect(rows[i]).toHaveTextContent(why);
    });
  });

  it("AC-36: why_source deterministic 'Imported by 2 files' is shown", () => {
    render(
      ui({
        ...base,
        source: "deterministic",
        items: [{ path: PATHS.ratelimit, why: "Imported by 2 files", why_source: "deterministic" }],
      }),
    );
    expect(screen.getByText("Imported by 2 files")).toBeInTheDocument();
  });

  it("AC-37: no_graph → 'Not available: the import graph covers JS/TS sources only' and no listitem", () => {
    render(ui({ source: "deterministic", unavailable_reason: "no_graph", items: [] }));
    expect(
      screen.getByText("Not available: the import graph covers JS/TS sources only"),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
});
