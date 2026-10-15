import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BlastRadius } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/blast.json";
import { githubBlobUrl } from "../../../../../../../../../lib/github-urls";

const mocks = vi.hoisted(() => ({
  useBlastRadius: vi.fn(),
  useResyncRepoIntel: vi.fn(),
}));
vi.mock("@/lib/hooks/blast", () => ({ useBlastRadius: mocks.useBlastRadius }));
vi.mock("@/lib/hooks/repo-intel", () => ({ useResyncRepoIntel: mocks.useResyncRepoIntel }));

import { BlastRadiusBlock } from "./BlastRadiusBlock";

afterEach(cleanup);

const RADIUS: BlastRadius = {
  changed_symbols: [
    { name: "formatMoney", file: "src/lib/money.ts", kind: "function" },
    { name: "parseMoney", file: "src/lib/money.ts", kind: "function" },
  ],
  downstream: [
    {
      symbol: "formatMoney",
      callers: [
        { name: "refund", file: "src/a.ts", line: 12 },
        { name: "order", file: "src/b.ts", line: 30 },
      ],
      endpoints_affected: ["GET /refunds"],
      crons_affected: ["0 * * * *"],
    },
    {
      symbol: "parseMoney",
      callers: [{ name: "cart", file: "src/c.ts", line: 5 }],
      endpoints_affected: ["GET /refunds", "POST /cart"],
      crons_affected: [],
    },
  ],
  summary: "2 changed symbols, 3 callers, 2 endpoints, 1 cron",
};

const mutate = vi.fn();
const refetch = vi.fn();

function setup(
  query: Record<string, unknown>,
  props: { repoFullName?: string | null; headSha?: string | null } = { repoFullName: "acme/payments-api", headSha: "abc" },
  resync: Record<string, unknown> = {},
) {
  mocks.useBlastRadius.mockReturnValue({ data: undefined, isLoading: false, isError: false, refetch, ...query });
  mocks.useResyncRepoIntel.mockReturnValue({ mutate, isPending: false, isSuccess: false, ...resync });
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
      <BlastRadiusBlock prId="p1" repoId="r1" repoFullName={props.repoFullName ?? null} headSha={props.headSha ?? null} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("BlastRadiusBlock", () => {
  it("shows the four summary counts with labels", () => {
    setup({ data: RADIUS });
    const summary = screen.getByLabelText("Blast radius summary");
    // 2 symbols, 3 callers, 2 unique endpoints, 1 cron
    expect(within(summary).getByText("symbols").previousSibling?.textContent).toBe("2");
    expect(within(summary).getByText("callers").previousSibling?.textContent).toBe("3");
    expect(within(summary).getByText("endpoints").previousSibling?.textContent).toBe("2");
    expect(within(summary).getByText("cron/jobs").previousSibling?.textContent).toBe("1");
  });

  it("keeps server order, expands the first symbol and toggles the rest", () => {
    setup({ data: RADIUS });
    const buttons = screen.getAllByRole("button", { expanded: undefined }).filter((b) => b.hasAttribute("aria-expanded"));
    expect(buttons.map((b) => b.textContent)).toEqual([
      expect.stringContaining("formatMoney"),
      expect.stringContaining("parseMoney"),
    ]);
    expect(buttons[0]!.getAttribute("aria-expanded")).toBe("true");
    expect(buttons[1]!.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("src/c.ts:5")).toBeNull();
    fireEvent.click(buttons[1]!);
    expect(buttons[1]!.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("src/c.ts:5")).toBeInTheDocument();
  });

  it("renders callers as safe GitHub links pinned to the head sha", () => {
    setup({ data: RADIUS });
    const link = screen.getByText("src/a.ts:12").closest("a")!;
    expect(link.getAttribute("href")).toBe(githubBlobUrl("acme/payments-api", "abc", "src/a.ts", 12));
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("shows endpoints and crons in separate labelled groups", () => {
    setup({ data: RADIUS });
    const endpoints = screen.getByLabelText("Endpoints");
    const crons = screen.getByLabelText("Crons");
    expect(within(endpoints).getByText("GET /refunds")).toBeInTheDocument();
    expect(within(crons).getByText("0 * * * *")).toBeInTheDocument();
    expect(within(endpoints).queryByText("0 * * * *")).toBeNull();
  });

  it("shows symbols as name() and keeps the caller function name as the link title", () => {
    setup({ data: RADIUS });
    expect(screen.getByText("formatMoney()")).toBeInTheDocument();
    expect(screen.getByText("src/a.ts:12").closest("[title]")?.getAttribute("title")).toBe("refund");
    expect(screen.queryByText("refund")).toBeNull();
  });

  it("explains an empty downstream", () => {
    setup({ data: { changed_symbols: RADIUS.changed_symbols, downstream: [], summary: "s" } });
    expect(screen.getByText("2 changed symbol(s), no downstream callers found.")).toBeInTheDocument();
  });

  it("shows a degraded badge with the reason and a Resync button", () => {
    setup({ data: { ...RADIUS, degraded: true, reason: "index_partial" } });
    expect(screen.getByText("Index incomplete: indexing is partial")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Resync" }));
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("renders file:line as plain text without repo or sha", () => {
    setup({ data: RADIUS }, { repoFullName: null, headSha: null });
    const node = screen.getByText("src/a.ts:12");
    expect(node.closest("a")).toBeNull();
  });

  it("shows a skeleton while loading and an error with retry", () => {
    setup({ isLoading: true });
    expect(screen.getByRole("status", { name: "Blast radius" })).toBeInTheDocument();
    cleanup();
    setup({ isError: true });
    expect(screen.getByText("Could not load the blast radius.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalled();
  });
  it("pluralises the per-symbol caller count", () => {
    setup({ data: RADIUS });
    expect(screen.getByText("1 caller")).toBeInTheDocument();
    expect(screen.queryByText("1 callers")).not.toBeInTheDocument();
  });
  it("switches between the Tree and Graph views", () => {
    setup({ data: RADIUS });
    const views = screen.getByRole("group", { name: "Blast radius view" });
    const tree = within(views).getByRole("button", { name: "Tree" });
    const graph = within(views).getByRole("button", { name: "Graph" });
    expect(tree).toHaveAttribute("aria-pressed", "true");
    expect(graph).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("img", { name: "Blast radius graph" })).toBeNull();

    fireEvent.click(graph);
    expect(graph).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("img", { name: "Blast radius graph" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /formatMoney/ })).toBeNull();

    fireEvent.click(tree);
    expect(screen.queryByRole("img", { name: "Blast radius graph" })).toBeNull();
    expect(screen.getByRole("button", { name: /formatMoney/ })).toBeInTheDocument();
  });

  it("hides the view switch when there are no callers", () => {
    setup({ data: { ...RADIUS, downstream: [] } });
    expect(screen.queryByRole("group", { name: "Blast radius view" })).toBeNull();
  });
});
