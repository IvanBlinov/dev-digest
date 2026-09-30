import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import skills from "../../../../../messages/en/skills.json";
import { BodyEditor } from "./BodyEditor";

afterEach(cleanup);

function setup(props: Partial<React.ComponentProps<typeof BodyEditor>> = {}) {
  const onChange = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ skills }}>
      <BodyEditor value={"# a\nb\nc"} onChange={onChange} label="Body" fileName="my-skill" {...props} />
    </NextIntlClientProvider>,
  );
  return { onChange };
}

describe("BodyEditor", () => {
  it("shows the file name, token estimate and one gutter number per line", () => {
    setup();
    expect(screen.getByText("my-skill.md")).toBeInTheDocument();
    expect(screen.getByText("~2 tokens")).toBeInTheDocument();
    expect(screen.getByTestId("line-gutter").textContent).toBe("1\n2\n3");
  });

  it("shows the unsaved badge only when dirty", () => {
    setup({ dirty: true });
    expect(screen.getByText("unsaved")).toBeInTheDocument();
  });

  it("emits edits", () => {
    const { onChange } = setup({ dirty: false });
    expect(screen.queryByText("unsaved")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Body"), { target: { value: "x" } });
    expect(onChange).toHaveBeenCalledWith("x");
  });
});
