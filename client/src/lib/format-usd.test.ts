import { describe, it, expect } from "vitest";
import { formatUsd } from "./format-usd";

describe("formatUsd (L01)", () => {
  it("unknown cost is an em dash, never $0.00", () => {
    expect(formatUsd(null)).toBe("—");
    expect(formatUsd(undefined)).toBe("—");
    expect(formatUsd(Number.NaN)).toBe("—");
  });
  it("sub-dollar values keep 4 decimals", () => {
    expect(formatUsd(0)).toBe("$0.0000");
    expect(formatUsd(0.01234)).toBe("$0.0123");
    expect(formatUsd(0.99999)).toBe("$1.0000");
  });
  it("dollar-plus values keep 2 decimals", () => {
    expect(formatUsd(1)).toBe("$1.00");
    expect(formatUsd(1.266)).toBe("$1.27");
  });
});
