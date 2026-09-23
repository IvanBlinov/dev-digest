import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(cleanup);

const FINDINGS: FindingRecord[] = [
  {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  },
];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });

  it("L01: severity filter narrows the list and the filter bar shows counts", () => {
    const onSelectSeverity = vi.fn();
    const findings = [
      FINDINGS[0]!,
      { ...FINDINGS[0]!, id: "f2", severity: "WARNING" as const, title: "Slow query" },
    ];
    const counts = { critical: 1, warning: 1, suggestion: 0 };
    const { rerender } = renderWithIntl(
      <FindingsPanel findings={findings} prId="pr1" severity="WARNING" severityCounts={counts} onSelectSeverity={onSelectSeverity} />,
    );
    expect(screen.getByText("Slow query")).toBeInTheDocument();
    expect(screen.queryByText("Hardcoded secret")).toBeNull();
    expect(screen.getByRole("button", { name: /^Critical/ })).toHaveTextContent("1");
    rerender(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <FindingsPanel findings={findings} prId="pr1" severity="SUGGESTION" severityCounts={counts} onSelectSeverity={onSelectSeverity} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("No suggestion findings")).toBeInTheDocument();
  });
});
