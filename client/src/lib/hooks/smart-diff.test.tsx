import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SmartDiffResponse } from "@devdigest/shared";

vi.mock("../api", () => ({
  api: { get: vi.fn() },
  ApiError: class ApiError extends Error {},
}));

import { api } from "../api";
import { useSmartDiff, smartDiffKey } from "./smart-diff";

const RESPONSE: SmartDiffResponse = {
  groups: [
    {
      role: "core",
      files: [{ path: "src/config.ts", additions: 4, deletions: 0, finding_lines: [12] }],
    },
  ],
  split_suggestion: { too_big: false, total_lines: 4, proposed_splits: [] },
};

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return { Wrapper };
}

beforeEach(() => vi.clearAllMocks());

describe("useSmartDiff", () => {
  it("GETs /pulls/:id/smart-diff and returns the data", async () => {
    vi.mocked(api.get).mockResolvedValue(RESPONSE);
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useSmartDiff("p1"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toEqual(RESPONSE));
    expect(api.get).toHaveBeenCalledWith("/pulls/p1/smart-diff");
    expect(smartDiffKey("p1")).toEqual(["smart-diff", "p1"]);
  });

  it("does not fetch without a PR id", () => {
    const { Wrapper } = wrapper();
    renderHook(() => useSmartDiff(null), { wrapper: Wrapper });
    expect(api.get).not.toHaveBeenCalled();
  });
});
