import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { TourMarkdown } from "./TourMarkdown";

afterEach(cleanup);

const hrefFor = (p: string) => `https://github.com/acme/payments-api/blob/main/${p}`;

function renderMd(text: string, knownPaths: string[] = [], inline?: boolean) {
  return render(<TourMarkdown text={text} knownPaths={knownPaths} hrefFor={hrefFor} inline={inline} />);
}

describe("TourMarkdown", () => {
  it("AC-67: <script>alert(1)</script> → no script element, and the text is not rendered as HTML", () => {
    const { container } = renderMd("Hello <script>alert(1)</script> world");
    expect(container.querySelector("script")).toBeNull();
    expect(container.innerHTML).not.toContain("<script");
  });

  it("AC-67: ![x](http://e/i.png) → no img element", () => {
    const { container } = renderMd("Before ![x](http://e/i.png) after");
    expect(container.querySelector("img")).toBeNull();
  });

  it("AC-67: [l](http://evil) and a bare http://bare.example → no link; the text 'l' remains", () => {
    const { container } = renderMd("See [l](http://evil) and http://bare.example now");
    expect(screen.queryByRole("link")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(container).toHaveTextContent(/See l and/);
  });

  it("AC-40: `src/a.ts` with knownPaths [src/a.ts] → link to hrefFor with target _blank and rel noopener noreferrer; `src/zzz.ts` → no link", () => {
    renderMd("Edit `src/a.ts` but not `src/zzz.ts`.", ["src/a.ts"]);
    const link = screen.getByRole("link", { name: "src/a.ts" });
    expect(link).toHaveAttribute("href", hrefFor("src/a.ts"));
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByText("src/zzz.ts")).toBeInTheDocument();
  });

  it("AC-67: **bold** → strong", () => {
    renderMd("This is **bold** text");
    expect(screen.getByText("bold").tagName).toBe("STRONG");
  });

  it("inline: a paragraph renders as a span, not a p", () => {
    const { container } = renderMd("just a sentence", [], true);
    expect(container.querySelector("p")).toBeNull();
    expect(screen.getByText("just a sentence")).toBeInTheDocument();
  });
});
