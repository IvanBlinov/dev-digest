import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile } from "@/lib/types";
import shell from "../../../../messages/en/shell.json";
import { FileCard } from "./FileCard";
import type { DiffAnnotationApi, LineAnnotation } from "../annotations";
import type { DiffCommentApi } from "../comments";

afterEach(cleanup);

const PATCH = [
  "@@ -10,3 +10,5 @@",
  " const a = 1;",
  " const b = 2;",
  "+const key = 'x';",
  "+const other = 3;",
  " export {};",
].join("\n");

const FILE: PrFile = {
  path: "src/config.ts",
  status: "modified",
  additions: 2,
  deletions: 0,
  patch: PATCH,
} as PrFile;

function annotation(key: string, text: string): LineAnnotation {
  return {
    id: text,
    path: "src/config.ts",
    key,
    marker: { color: "red", label: "blocker" },
    node: <div>{text}</div>,
  };
}

function api(overrides: Partial<DiffAnnotationApi> = {}): DiffAnnotationApi {
  return {
    items: [annotation("RIGHT:12", "finding-on-12")],
    visible: true,
    flaggedPaths: new Set(["src/config.ts"]),
    flagLabel: "Has findings",
    outsideTitle: "Findings outside the diff",
    ...overrides,
  };
}

function renderCard(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FileCard annotations", () => {
  it("shows a flag dot without a number, separate from the comment counter", () => {
    const commenting: DiffCommentApi = {
      comments: [
        { id: 1, path: "src/config.ts", line: 12, side: "RIGHT", created_at: "2026-01-01", in_reply_to_id: null },
        { id: 2, path: "src/config.ts", line: 12, side: "RIGHT", created_at: "2026-01-02", in_reply_to_id: 1 },
      ] as DiffCommentApi["comments"],
      canComment: false,
      showComments: false,
      posting: false,
      onSubmit: async () => undefined,
    };
    renderCard(<FileCard file={FILE} commenting={commenting} annotations={api()} />);
    const dot = screen.getByLabelText("Has findings");
    expect(dot).not.toHaveTextContent(/\d/);
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(dot).not.toContainElement(screen.getByText("2"));
  });

  it("renders the node right after its line, with the marker label, and outside findings at the end", () => {
    renderCard(
      <FileCard
        file={FILE}
        annotations={api({
          items: [annotation("RIGHT:12", "finding-on-12"), annotation("RIGHT:99", "finding-on-99")],
        })}
      />,
    );
    const node = screen.getByText("finding-on-12");
    const row = node.parentElement!.parentElement!; // rail → line wrapper
    expect(within(row).getByText("const key = 'x';")).toBeInTheDocument();
    expect(within(row).getByText("blocker")).toBeInTheDocument();
    const outside = screen.getByText("Findings outside the diff").parentElement!;
    expect(within(outside).getByText("finding-on-99")).toBeInTheDocument();
  });

  it("hides nodes and the outside block when not visible but keeps markers and the dot", () => {
    renderCard(
      <FileCard
        file={FILE}
        annotations={api({
          visible: false,
          items: [annotation("RIGHT:12", "finding-on-12"), annotation("RIGHT:99", "finding-on-99")],
        })}
      />,
    );
    expect(screen.queryByText("finding-on-12")).not.toBeInTheDocument();
    expect(screen.queryByText("finding-on-99")).not.toBeInTheDocument();
    expect(screen.queryByText("Findings outside the diff")).not.toBeInTheDocument();
    expect(screen.getByText("blocker")).toBeInTheDocument();
    expect(screen.getByLabelText("Has findings")).toBeInTheDocument();
  });

  it("honours defaultOpen={false}", () => {
    renderCard(<FileCard file={FILE} defaultOpen={false} />);
    expect(screen.queryByText("const key = 'x';")).not.toBeInTheDocument();
  });

  it("renders as before without annotations", () => {
    renderCard(<FileCard file={FILE} />);
    expect(screen.getByText("const key = 'x';")).toBeInTheDocument();
    expect(screen.queryByLabelText("Has findings")).not.toBeInTheDocument();
    expect(screen.queryByText("blocker")).not.toBeInTheDocument();
  });
});

describe("FileCard target (Files changed navigation)", () => {
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

  const BIG: PrFile = { ...FILE, additions: 500, deletions: 0 } as PrFile;

  it("AC-57: a large file collapsed by default opens when targeted, is highlighted, scrolled to and focused", () => {
    const plain = renderCard(<FileCard file={BIG} />);
    expect(screen.queryByText("const key = 'x';")).not.toBeInTheDocument();
    expect(plain.container.querySelector("[data-target]")).toBeNull();
    expect(scrolled).toHaveLength(0);
    cleanup();

    const view = renderCard(<FileCard file={BIG} target={{ line: null }} />);
    expect(screen.getByText("const key = 'x';")).toBeInTheDocument();
    const card = view.container.querySelector("[data-target='true']") as HTMLElement;
    expect(card).not.toBeNull();
    expect(card).toContainElement(screen.getByText("src/config.ts"));
    expect(document.activeElement).toBe(card);
    expect(scrolled).toContain(card);
  });

  it("AC-58: the targeted line is highlighted and scrolled into view; other lines are not", () => {
    const { container } = renderCard(<FileCard file={FILE} target={{ line: 12 }} />);
    const row = container.querySelector("[data-line='12']") as HTMLElement;
    expect(row).not.toBeNull();
    expect(row).toHaveAttribute("aria-current", "location");
    expect(scrolled).toContain(row);
    expect(container.querySelector("[data-line='11']")).not.toHaveAttribute("aria-current");
  });

  it("AC-58: without a target no line is highlighted", () => {
    const { container } = renderCard(<FileCard file={FILE} />);
    expect(container.querySelector("[aria-current]")).toBeNull();
    expect(scrolled).toHaveLength(0);
  });
});
