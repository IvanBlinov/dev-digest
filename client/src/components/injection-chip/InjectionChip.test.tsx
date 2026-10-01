import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import common from "../../../messages/en/common.json";
import { InjectionChip } from "./InjectionChip";

afterEach(cleanup);

describe("InjectionChip", () => {
  it("shows the 'Injection detected' label in the critical colour with an alert icon", () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={{ common }}>
        <InjectionChip />
      </NextIntlClientProvider>,
    );
    const chip = screen.getByText("Injection detected").closest("span")!;
    expect(chip).toBeInTheDocument();
    expect((container.firstElementChild as HTMLElement).style.color).toBe("var(--crit)");
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
