import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReviewFocusItem } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/brief.json";
import { ReviewFocus } from "./ReviewFocus";

afterEach(cleanup);

const linkCtx = {
  changedFiles: new Set(["src/a.ts", "src/b.ts"]),
  repoFullName: "acme/payments-api",
  headSha: "abc123",
};

const ITEMS: ReviewFocusItem[] = [
  { file: "src/a.ts", line: 7, reason: "Token bucket refills on every call" },
  { file: "src/callers/pay.ts", line: 40, reason: "Caller assumes no throttling" },
];

function setup(props: Partial<React.ComponentProps<typeof ReviewFocus>> = {}) {
  const onNavigate = vi.fn();
  const view = render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <ReviewFocus items={ITEMS} pending={false} linkCtx={linkCtx} onNavigate={onNavigate} {...props} />
    </NextIntlClientProvider>,
  );
  return { onNavigate, ...view };
}

describe("ReviewFocus", () => {
  it("AC-43: shows the heading, a count badge and `file:line — reason` for each item", () => {
    setup();
    expect(screen.getByText("Review focus — read these first")).toBeInTheDocument();
    expect(screen.getByText(String(ITEMS.length))).toBeInTheDocument();
    expect(screen.getByText("src/a.ts:7")).toBeInTheDocument();
    expect(screen.getByText(/Token bucket refills on every call/)).toBeInTheDocument();
    expect(screen.getByText("src/callers/pay.ts:40")).toBeInTheDocument();
    expect(screen.getByText(/Caller assumes no throttling/)).toBeInTheDocument();
  });

  it("AC-44 / NFR-6: a changed-file link is named for Files changed and navigates through onNavigate", () => {
    const { onNavigate } = setup();
    const link = screen.getByRole("link", { name: "Open src/a.ts line 7 in Files changed" });
    expect(link).toHaveAttribute("href", "?tab=diff&file=src%2Fa.ts&line=7");
    expect(link).not.toHaveAttribute("target", "_blank");
    const notPrevented = fireEvent.click(link);
    expect(notPrevented).toBe(false); // default prevented: no full navigation, no router.replace
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith("?tab=diff&file=src%2Fa.ts&line=7");
  });

  it("AC-43 / EC-24: a blast-only item opens GitHub at the head SHA in a new tab with noopener noreferrer", () => {
    const { onNavigate } = setup();
    const link = screen.getByRole("link", { name: /src\/callers\/pay\.ts/ });
    expect(link).toHaveAttribute("href", "https://github.com/acme/payments-api/blob/abc123/src/callers/pay.ts#L40");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel") ?? "").toMatch(/noopener/);
    expect(link.getAttribute("rel") ?? "").toMatch(/noreferrer/);
    fireEvent.click(link);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("AC-43: a blast-only item is plain text when the repo owner/name is unknown", () => {
    setup({ linkCtx: { ...linkCtx, repoFullName: null } });
    expect(screen.queryByRole("link", { name: /src\/callers\/pay\.ts/ })).toBeNull();
    expect(screen.getByText(/src\/callers\/pay\.ts:40/)).toBeInTheDocument();
  });

  it("AC-51: an empty list shows the no-focus message", () => {
    setup({ items: [] });
    expect(screen.getByText(messages.noFocus)).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("AC-48: while pending, skeletons replace the rows", () => {
    const { container } = setup({ pending: true });
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
    expect(screen.queryByText("src/a.ts:7")).toBeNull();
    expect(screen.queryByText(messages.noFocus)).toBeNull();
  });

  it("AC-56: a reason renders as plain text, not Markdown or HTML", () => {
    const { container } = setup({
      items: [{ file: "src/a.ts", line: 7, reason: "**loud** <img src=x onerror=alert(1)> `c`" }],
    });
    expect(screen.getByText(/\*\*loud\*\* <img src=x onerror=alert\(1\)> `c`/)).toBeInTheDocument();
    expect(container.querySelector("img, strong, code")).toBeNull();
  });
});
