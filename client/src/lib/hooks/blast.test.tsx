import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BlastRadius } from "@devdigest/shared";

vi.mock("../api", () => ({
  api: { get: vi.fn() },
  ApiError: class ApiError extends Error {},
}));

import { api } from "../api";
import { useBlastRadius, blastKey } from "./blast";

const RESPONSE: BlastRadius = {
  changed_symbols: [{ name: "formatMoney", file: "src/lib/money.ts", kind: "function" }],
  downstream: [],
  summary: "1 changed symbol, 0 callers, 0 endpoints, 0 crons",
};

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return { Wrapper };
}

beforeEach(() => vi.clearAllMocks());

describe("useBlastRadius", () => {
  it("GETs /pulls/:id/blast and returns the data", async () => {
    vi.mocked(api.get).mockResolvedValue(RESPONSE);
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useBlastRadius("p1"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toEqual(RESPONSE));
    expect(api.get).toHaveBeenCalledWith("/pulls/p1/blast");
    expect(blastKey("p1")).toEqual(["blast", "p1"]);
  });

  it("does not fetch without a PR id", () => {
    const { Wrapper } = wrapper();
    renderHook(() => useBlastRadius(null), { wrapper: Wrapper });
    expect(api.get).not.toHaveBeenCalled();
  });
});
