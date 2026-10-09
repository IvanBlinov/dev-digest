import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrIntentResponse } from "@devdigest/shared";

vi.mock("../api", () => ({
  api: { get: vi.fn(), post: vi.fn() },
  ApiError: class ApiError extends Error {},
}));

import { api } from "../api";
import { useDetectIntent, usePrIntent, prIntentKey } from "./intent";

const RESPONSE: PrIntentResponse = { intent: null };

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return { qc, Wrapper };
}

beforeEach(() => vi.clearAllMocks());

describe("intent hooks", () => {
  it("usePrIntent does not fetch without a PR id", () => {
    const { Wrapper } = wrapper();
    renderHook(() => usePrIntent(null), { wrapper: Wrapper });
    expect(api.get).not.toHaveBeenCalled();
  });

  it("usePrIntent GETs /pulls/:id/intent", async () => {
    vi.mocked(api.get).mockResolvedValue(RESPONSE);
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => usePrIntent("p1"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toEqual(RESPONSE));
    expect(api.get).toHaveBeenCalledWith("/pulls/p1/intent");
  });

  it("useDetectIntent POSTs and writes the query cache", async () => {
    const detected = { intent: { summary: "x" } } as unknown as PrIntentResponse;
    vi.mocked(api.post).mockResolvedValue(detected);
    const { qc, Wrapper } = wrapper();
    const { result } = renderHook(() => useDetectIntent("p1"), { wrapper: Wrapper });
    result.current.mutate();
    await waitFor(() => expect(qc.getQueryData(prIntentKey("p1"))).toEqual(detected));
    expect(api.post).toHaveBeenCalledWith("/pulls/p1/intent");
    expect(prIntentKey("p1")).toEqual(["pr-intent", "p1"]);
  });
});
