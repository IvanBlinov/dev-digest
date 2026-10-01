import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import skills from "../../../../../messages/en/skills.json";
import { SkillSelectPrompt } from "./SkillSelectPrompt";

afterEach(cleanup);

describe("SkillSelectPrompt", () => {
  it("asks the user to select a skill", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ skills }}>
        <SkillSelectPrompt />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Select a skill")).toBeInTheDocument();
  });
});
