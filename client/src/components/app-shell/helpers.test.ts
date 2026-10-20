import { describe, it, expect } from "vitest";
import { activeKeyFor } from "./helpers";

describe("activeKeyFor", () => {
  it("AC-47: activeKeyFor('/onboarding') === '' (the Add-repo screen has no sidebar key)", () => {
    expect(activeKeyFor("/onboarding")).toBe("");
  });

  it("AC-47: activeKeyFor('/repos/r1/onboarding') === 'onboarding-tour'", () => {
    expect(activeKeyFor("/repos/r1/onboarding")).toBe("onboarding-tour");
    expect(activeKeyFor("/repos/r1/onboarding/")).toBe("onboarding-tour");
  });

  it("AC-47: '/repos/r1/pulls' stays 'pulls'", () => {
    expect(activeKeyFor("/repos/r1/pulls")).toBe("pulls");
  });
});
