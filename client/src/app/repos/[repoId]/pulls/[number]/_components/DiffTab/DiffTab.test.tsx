import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrFile, ReviewRecord, SmartDiffResponse } from "@devdigest/shared";
import prReview from "../../../../../../../../messages/en/prReview.json";
import shell from "../../../../../../../../messages/en/shell.json";
import brief from "../../../../../../../../messages/en/brief.json";

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
    <NextIntlClientProvider locale="en" messages={{ prReview, shell, brief }}>
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

describe("DiffTab file/line navigation (?tab=diff&file=&line=)", () => {
  const scrolled: Element[] = [];
  const original = Element.prototype.scrollIntoView;
  beforeEach(() => {
    scrolled.length = 0;
    Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
      scrolled.push(this);
    });
  });
  afterEach(() => {
    Element.prototype.scrollIntoView = original;
  });

  const DOC_PATCH = patch(["@@ -0,0 +1,3 @@", "+new doc 1", "+new doc 2", "+new doc 3"]);
  const withDoc = FILES.map((f) => (f.path === "docs/rate-limiting.md" ? file(f.path, 16, 0, DOC_PATCH) : f));
  const scrolledToCardOf = (path: string) => scrolled.some((el) => el.textContent?.includes(path));

  it("AC-57: a file in the collapsed docs group opens its group, shows the file, scrolls to it and takes focus", () => {
    render(ui({ files: withDoc, targetFile: "docs/rate-limiting.md", targetLine: null }));
    expect(screen.getByText("docs/rate-limiting.md")).toBeInTheDocument();
    expect(screen.getByText(/new doc 3/)).toBeInTheDocument();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toContainElement(screen.getByText("docs/rate-limiting.md"));
    expect(scrolledToCardOf("docs/rate-limiting.md")).toBe(true);
    expect(screen.queryByText("File not in this PR's diff")).not.toBeInTheDocument();
    expect(screen.queryByText("Line not shown in this diff")).not.toBeInTheDocument();
  });

  it("AC-58: a line the patch renders is scrolled into view", () => {
    render(ui({ targetFile: "src/config.ts", targetLine: 12 }));
    expect(scrolled.some((el) => el.getAttribute("data-line") === "12")).toBe(true);
    expect(screen.queryByText("Line not shown in this diff")).not.toBeInTheDocument();
  });

  it("AC-59: a file that is not in the diff shows the notice at the top", () => {
    render(ui({ targetFile: "src/not-in-this-pr.ts", targetLine: 3 }));
    expect(screen.getByText("File not in this PR's diff")).toBeInTheDocument();
  });

  it("AC-60: a file without a patch plus a line scrolls to the card and says the line is not shown", () => {
    render(ui({ targetFile: "src/api/users.ts", targetLine: 5 }));
    expect(screen.getByText("Line not shown in this diff")).toBeInTheDocument();
    expect(scrolledToCardOf("src/api/users.ts")).toBe(true);
    expect(document.activeElement).toContainElement(screen.getByText("src/api/users.ts"));
  });

  it("AC-60: a line outside every hunk is not shown either", () => {
    render(ui({ targetFile: "src/config.ts", targetLine: 999 }));
    expect(screen.getByText("Line not shown in this diff")).toBeInTheDocument();
    expect(scrolledToCardOf("src/config.ts")).toBe(true);
  });

  it("EC-20: the same behaviour in original order", () => {
    const first = render(ui({ order: "original", files: withDoc, targetFile: "docs/rate-limiting.md", targetLine: 3 }));
    expect(screen.getByText(/new doc 3/)).toBeInTheDocument();
    expect(scrolledToCardOf("docs/rate-limiting.md")).toBe(true);
    first.unmount();

    render(ui({ order: "original", targetFile: "src/api/users.ts", targetLine: 5 }));
    expect(screen.getByText("Line not shown in this diff")).toBeInTheDocument();
    cleanup();

    render(ui({ order: "original", targetFile: "src/not-in-this-pr.ts", targetLine: null }));
    expect(screen.getByText("File not in this PR's diff")).toBeInTheDocument();
  });

  it("without a target nothing is scrolled and no notice is shown", () => {
    render(ui());
    expect(scrolled).toHaveLength(0);
    expect(screen.queryByText("File not in this PR's diff")).not.toBeInTheDocument();
    expect(screen.queryByText("Line not shown in this diff")).not.toBeInTheDocument();
    // docs stays collapsed by default
    expect(screen.queryByText("docs/rate-limiting.md")).not.toBeInTheDocument();
  });
});
