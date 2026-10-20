import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TruncatedText } from "./TruncatedText";

afterEach(cleanup);

const LONG = "src/some/very/deep/directory/structure/file-with-a-long-name.ts";

describe("TruncatedText", () => {
  it("EC-19: focus shows the full value in role tooltip; blur hides it; mouseenter shows it", async () => {
    const user = userEvent.setup();
    render(<TruncatedText text={LONG} />);
    const el = screen.getByText(LONG);
    expect(screen.queryByRole("tooltip")).toBeNull();

    await user.tab();
    expect(el).toHaveFocus();
    expect(screen.getByRole("tooltip")).toHaveTextContent(LONG);

    await user.tab();
    expect(screen.queryByRole("tooltip")).toBeNull();

    await user.hover(el);
    expect(screen.getByRole("tooltip")).toHaveTextContent(LONG);
    await user.unhover(el);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("EC-19: a separate tooltip text is shown instead of the value", async () => {
    const user = userEvent.setup();
    render(<TruncatedText text="pnpm run dev" tooltip="tsx watch src/index.ts" />);
    await user.hover(screen.getByText("pnpm run dev"));
    expect(screen.getByRole("tooltip")).toHaveTextContent("tsx watch src/index.ts");
  });

  it("AC-67: text `<b>x</b>` is shown literally", () => {
    const { container } = render(<TruncatedText text="<b>x</b>" />);
    expect(screen.getByText("<b>x</b>")).toBeInTheDocument();
    expect(container.querySelector("b")).toBeNull();
  });
});
