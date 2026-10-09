import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrFile, ReviewRecord, SmartDiffResponse } from "@devdigest/shared";
import prReview from "../../../../../../../../messages/en/prReview.json";
import shell from "../../../../../../../../messages/en/shell.json";

const mutate = vi.fn();
const state: { reviews: ReviewRecord[]; smart: { data?: SmartDiffResponse; isLoading?: boolean; isError?: boolean } } = {
  reviews: [],
  smart: {},
};

vi.mock("@/lib/hooks/reviews", () => ({
  usePrComments: () => ({ data: [] }),
  useCreatePrComment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePrReviews: () => ({ data: state.reviews }),
  useFindingAction: () => ({ mutate, isPending: false }),
}));
vi.mock("@/lib/hooks/smart-diff", () => ({ useSmartDiff: () => state.smart }));

import { DiffTab } from "./DiffTab";

afterEach(cleanup);
beforeEach(() => {
  mutate.mockClear();
  state.reviews = [];
  state.smart = { data: SMART };
});

const patch = (lines: string[]) => lines.join("\n");
const file = (path: string, additions: number, deletions: number, p: string | null = null): PrFile =>
  ({ path, status: "modified", additions, deletions, patch: p }) as PrFile;

const FILES: PrFile[] = [
  file("src/middleware/ratelimit.ts", 85, 0),
  file("src/api/public/webhooks.ts", 30, 10),
  file("src/config.ts", 4, 0, patch(["@@ -10,2 +10,3 @@", " const a = 1;", " const b = 2;", "+const key = 'sk_live';"])),
  file("src/api/users.ts", 7, 2),
  file("test/middleware/ratelimit.test.ts", 68, 0),
  file("package.json", 2, 1),
  file("src/api/public/index.ts", 4, 5),
  file("docs/rate-limiting.md", 16, 0),
  file("pnpm-lock.yaml", 31, 20, patch(["@@ -1,1 +1,1 @@", "+lock-line"])),
];

const sf = (f: PrFile) => ({ path: f.path, additions: f.additions, deletions: f.deletions, finding_lines: [] });
const grp = (role: SmartDiffResponse["groups"][number]["role"], idx: number[]) => ({
  role,
  files: idx.map((i) => sf(FILES[i]!)),
});
const SMART: SmartDiffResponse = {
  groups: [grp("core", [0, 1, 2, 3]), grp("tests", [4]), grp("wiring", [5, 6]), grp("docs", [7]), grp("boilerplate", [8])],
  split_suggestion: { too_big: false, total_lines: 285, proposed_splits: [] },
};

const finding = (over: Partial<FindingRecord> = {}): FindingRecord => ({
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret key in commit",
  file: "src/config.ts",
  start_line: 12,
  end_line: 12,
  rationale: "A live key is committed.",
  suggestion: null,
  confidence: 0.9,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
  scope: "in",
  ...over,
} as FindingRecord);

const review = (findings: FindingRecord[]): ReviewRecord =>
  ({
    id: "r1",
    run_id: "run1",
    agent_id: "a1",
    agent_name: "Reviewer",
    kind: "review",
    created_at: "2026-10-08T10:00:00Z",
    findings,
  }) as unknown as ReviewRecord;

function ui(props: Partial<React.ComponentProps<typeof DiffTab>> = {}) {
  return (
    <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
      <DiffTab
        prId="p1"
        filesCount={9}
        files={FILES}
        order="smart"
        onOrderChange={vi.fn()}
        repoFullName="acme/api"
        headSha="abc"
        {...props}
      />
    </NextIntlClientProvider>
  );
}

describe("DiffTab smart view", () => {
  it("lists groups in role order with totals; docs and boilerplate start collapsed", () => {
    render(ui());
    expect(screen.getByText(/Reviewer-ordered diff · 9 files · \+247 −38/)).toBeInTheDocument();
    const order = ["Core", "Tests", "Wiring", "Docs", "Boilerplate"].map((l) =>
      screen.getByText(l, { selector: "span" }),
    );
    order.slice(1).forEach((el, i) =>
      expect(order[i]!.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(),
    );

    expect(screen.getByText("src/config.ts")).toBeInTheDocument();
    expect(screen.queryByText("pnpm-lock.yaml")).not.toBeInTheDocument();
    expect(screen.queryByText("docs/rate-limiting.md")).not.toBeInTheDocument();
    expect(screen.getByText("Review not run yet")).toBeInTheDocument();
    expect(screen.queryByLabelText(/with findings/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Boilerplate/ }));
    expect(screen.getByText("pnpm-lock.yaml")).toBeInTheDocument();
  });

  it("keeps the counter on a collapsed group", () => {
    state.reviews = [review([finding({ id: "f9", file: "pnpm-lock.yaml", start_line: 1, end_line: 1 })])];
    render(ui());
    expect(screen.queryByText("pnpm-lock.yaml")).not.toBeInTheDocument();
    const header = screen.getByRole("button", { name: /Boilerplate/ });
    expect(header).toHaveTextContent("1");
    expect(screen.queryByText("Review not run yet")).not.toBeInTheDocument();
  });

  it("shows a finding under its line, acts on it, and drops flags once dismissed", () => {
    state.reviews = [review([finding()])];
    const { rerender } = render(ui());
    expect(screen.getByText("Hardcoded Stripe secret key in commit")).toBeInTheDocument();
    expect(screen.getByText("blocker")).toBeInTheDocument();
    expect(screen.getByLabelText("1 file with findings")).toBeInTheDocument();
    expect(screen.getByLabelText("Has findings")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(mutate).toHaveBeenCalledWith({ findingId: "f1", action: "dismiss", prId: "p1" });

    state.reviews = [review([finding({ dismissed_at: "2026-10-08T11:00:00Z" })])];
    rerender(ui());
    expect(screen.getByText("Hardcoded Stripe secret key in commit")).toBeInTheDocument();
    expect(screen.queryByLabelText(/with findings/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Has findings")).not.toBeInTheDocument();
    expect(screen.queryByText("blocker")).not.toBeInTheDocument();
  });

  it("renders the finding card expanded by default and collapses on header click", () => {
    state.reviews = [review([finding()])];
    render(ui());
    expect(screen.getByText("A live key is committed.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();

    fireEvent.click(screen.getByText("Hardcoded Stripe secret key in commit"));
    expect(screen.queryByText("A live key is committed.")).not.toBeInTheDocument();
    expect(screen.getByText("Hardcoded Stripe secret key in commit")).toBeInTheDocument();
  });

  it("hides finding comments with the comments toggle", () => {
    state.reviews = [review([finding()])];
    render(ui());
    fireEvent.click(screen.getByRole("button", { name: /Hide comments \(1\)/ }));
    expect(screen.queryByText("Hardcoded Stripe secret key in commit")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Show comments \(1\)/ })).toBeInTheDocument();
  });
});

describe("DiffTab order toggle and fallback", () => {
  it("emits the chosen order and renders no groups in original order", () => {
    const onOrderChange = vi.fn();
    const { rerender } = render(ui({ onOrderChange }));
    fireEvent.click(screen.getByRole("button", { name: "Original order" }));
    expect(onOrderChange).toHaveBeenCalledWith("original");

    rerender(ui({ onOrderChange, order: "original" }));
    expect(screen.queryByText("Boilerplate")).not.toBeInTheDocument();
    expect(screen.getByText("pnpm-lock.yaml")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Smart order" }));
    expect(onOrderChange).toHaveBeenLastCalledWith("smart");
  });

  it("falls back to the original list when smart-diff fails", () => {
    state.smart = { isError: true };
    render(ui());
    expect(screen.queryByText("Boilerplate")).not.toBeInTheDocument();
    expect(screen.getByText("src/config.ts")).toBeInTheDocument();
  });
});
