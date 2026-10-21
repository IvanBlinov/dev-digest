import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Risk } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/brief.json";
import { RiskAreas } from "./RiskAreas";

afterEach(cleanup);

const linkCtx = {
  changedFiles: new Set(["src/middleware/ratelimit.ts", "package.json"]),
  repoFullName: "acme/payments-api",
  headSha: "abc123",
};

const RISKS: Risk[] = [
  {
    kind: "security",
    title: "Auth surface touched",
    explanation: "The limiter changes who can reach public endpoints.",
    severity: "high",
    refs: [
      { file: "src/middleware/ratelimit.ts", start_line: 12, end_line: 18 },
      { file: "src/callers/pay.ts", start_line: 40, end_line: 40 },
    ],
  },
  {
    kind: "dependency",
    title: "New dependency: ioredis",
    explanation: "Adds a Redis client.",
    severity: "medium",
    refs: [{ file: "package.json", start_line: null, end_line: null }],
  },
];

function setup(props: Partial<React.ComponentProps<typeof RiskAreas>> = {}) {
  const onNavigate = vi.fn();
  const view = render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <RiskAreas risks={RISKS} pending={false} linkCtx={linkCtx} onNavigate={onNavigate} {...props} />
    </NextIntlClientProvider>,
  );
  return { onNavigate, ...view };
}

const row = (title: RegExp | string) => screen.getByRole("button", { name: title });

describe("RiskAreas", () => {
  it("AC-41: each row shows an icon, the title and its first ref as file:start-end, or the file alone", () => {
    setup();
    const first = row(/Auth surface touched/);
    expect(first.querySelector("svg")).not.toBeNull();
    expect(within(first).getByText("src/middleware/ratelimit.ts:12-18")).toBeInTheDocument();
    const second = row(/New dependency: ioredis/);
    expect(within(second).getByText("package.json")).toBeInTheDocument();
    expect(within(second).queryByText(/package\.json:/)).toBeNull();
  });

  it("AC-42: activating a row expands the explanation and every ref, and toggles aria-expanded", () => {
    setup();
    const first = row(/Auth surface touched/);
    expect(first).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("The limiter changes who can reach public endpoints.")).toBeNull();

    fireEvent.click(first);
    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("The limiter changes who can reach public endpoints.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /src\/callers\/pay\.ts/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /src\/middleware\/ratelimit\.ts/ })).toBeInTheDocument();

    fireEvent.click(first);
    expect(first).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("The limiter changes who can reach public endpoints.")).toBeNull();
  });

  it("AC-45: a ref on a changed file navigates to Files changed (with the line), without a full page load", () => {
    const { onNavigate } = setup();
    fireEvent.click(row(/Auth surface touched/));
    const link = screen.getByRole("link", { name: /src\/middleware\/ratelimit\.ts/ });
    expect(link).toHaveAttribute("href", "?tab=diff&file=src%2Fmiddleware%2Fratelimit.ts&line=12");
    const notPrevented = fireEvent.click(link);
    expect(notPrevented).toBe(false); // preventDefault: the page navigates through onNavigate
    expect(onNavigate).toHaveBeenCalledWith("?tab=diff&file=src%2Fmiddleware%2Fratelimit.ts&line=12");
  });

  it("AC-45: a ref without a line navigates to the file only", () => {
    const { onNavigate } = setup();
    fireEvent.click(row(/New dependency: ioredis/));
    fireEvent.click(screen.getByRole("link", { name: /package\.json/ }));
    expect(onNavigate).toHaveBeenCalledWith("?tab=diff&file=package.json");
  });

  it("AC-45 / EC-24: a blast-only ref opens GitHub at the head SHA in a new tab with noopener noreferrer", () => {
    const { onNavigate } = setup();
    fireEvent.click(row(/Auth surface touched/));
    const link = screen.getByRole("link", { name: /src\/callers\/pay\.ts/ });
    expect(link).toHaveAttribute("href", "https://github.com/acme/payments-api/blob/abc123/src/callers/pay.ts#L40");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel") ?? "").toMatch(/noopener/);
    expect(link.getAttribute("rel") ?? "").toMatch(/noreferrer/);
    fireEvent.click(link);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("AC-43 / EC-24: a blast-only ref is plain text, not a link, when the repo owner/name is unknown", () => {
    setup({ linkCtx: { ...linkCtx, repoFullName: null } });
    fireEvent.click(row(/Auth surface touched/));
    expect(screen.queryByRole("link", { name: /src\/callers\/pay\.ts/ })).toBeNull();
    expect(screen.getByText(/src\/callers\/pay\.ts/)).toBeInTheDocument();
  });

  it("EC-21: a very long path is cut in the middle with the full value on hover", () => {
    const longPath = "packages/payments/src/middleware/rate-limiting/token-bucket/implementation/limiter.ts";
    setup({
      risks: [{ ...RISKS[1]!, title: "Long one", refs: [{ file: longPath, start_line: 3, end_line: 4 }] }],
      linkCtx: { ...linkCtx, changedFiles: new Set([longPath]) },
    });
    expect(screen.getByTitle(longPath)).toBeInTheDocument();
    expect(screen.queryByText(`${longPath}:3-4`)).toBeNull();
  });

  it("AC-51: an empty list shows the no-risks message", () => {
    setup({ risks: [] });
    expect(screen.getByText(messages.noRisks)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("AC-48: while pending, skeletons replace the rows", () => {
    const { container } = setup({ pending: true });
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
    expect(screen.queryByText("Auth surface touched")).toBeNull();
    expect(screen.queryByText(messages.noRisks)).toBeNull();
  });

  it("AC-56: Markdown and HTML in a title and an explanation render as literal text", () => {
    const { container } = setup({
      risks: [{ ...RISKS[0]!, title: "**bold** <b>x</b>", explanation: "see <script>alert(1)</script> and `code`" }],
    });
    fireEvent.click(row(/bold/));
    expect(screen.getByText("**bold** <b>x</b>")).toBeInTheDocument();
    expect(screen.getByText("see <script>alert(1)</script> and `code`")).toBeInTheDocument();
    expect(container.querySelector("b, strong, script, code")).toBeNull();
  });

  it("NFR-6: a row is reachable and operable from the keyboard", () => {
    setup();
    const first = row(/Auth surface touched/);
    expect(first.tabIndex).toBeGreaterThanOrEqual(0);
    first.focus();
    expect(document.activeElement).toBe(first);
  });
});
