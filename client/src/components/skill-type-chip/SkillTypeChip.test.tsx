import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SkillTypeChip } from "./SkillTypeChip";

afterEach(cleanup);

describe("SkillTypeChip", () => {
  it.each(["rubric", "convention", "security", "custom"] as const)("shows the %s label", (type) => {
    render(<SkillTypeChip type={type} />);
    expect(screen.getByText(type)).toBeInTheDocument();
  });

  it("uses a distinct colour per type", () => {
    const { container: a } = render(<SkillTypeChip type="security" />);
    const { container: b } = render(<SkillTypeChip type="rubric" />);
    const colorOf = (el: HTMLElement) => (el.firstElementChild as HTMLElement).style.color;
    expect(colorOf(a)).not.toBe(colorOf(b));
  });
});
