import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrBriefResponse } from "@devdigest/shared";

vi.mock("../api", () => {
  class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }
  return { api: { get: vi.fn(), post: vi.fn() }, ApiError };
});

import { api, ApiError } from "../api";
import { usePrBrief, useGenerateBrief, prBriefKey } from "./brief";

const EMPTY: PrBriefResponse = { brief: null, stale: false, stale_reason: null };
const FRESH = { ...EMPTY, stale: true, stale_reason: "head_moved" } as PrBriefResponse;

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return { qc, Wrapper };
}

beforeEach(() => vi.clearAllMocks());

describe("brief hooks", () => {
  it("AC-46: mounting usePrBrief makes one GET and never a POST", async () => {
    vi.mocked(api.get).mockResolvedValue(EMPTY);
    const { Wrapper } = setup();
    const { result } = renderHook(() => usePrBrief("p1"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toEqual(EMPTY));
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith("/pulls/p1/brief");
    expect(api.post).not.toHaveBeenCalled();
    expect(prBriefKey("p1")).toEqual(["pr-brief", "p1"]);
  });

  it("does not fetch without a PR id", () => {
    const { Wrapper } = setup();
    renderHook(() => usePrBrief(null), { wrapper: Wrapper });
    expect(api.get).not.toHaveBeenCalled();
  });

  it("AC-47: mutate POSTs and replaces the cached response; errors are not toasted globally", async () => {
    vi.mocked(api.post).mockResolvedValue(FRESH);
    const { qc, Wrapper } = setup();
    const { result } = renderHook(() => useGenerateBrief("p1"), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(api.post).toHaveBeenCalledWith("/pulls/p1/brief");
    expect(qc.getQueryData(prBriefKey("p1"))).toEqual(FRESH);
    const mutation = qc.getMutationCache().getAll()[0]!;
    expect(mutation.meta).toEqual({ silentError: true });
  });

  it("AC-50: a 409 refetches the stored brief", async () => {
    vi.mocked(api.get).mockResolvedValue(EMPTY);
    vi.mocked(api.post).mockRejectedValue(new ApiError("busy", 409));
    const { qc, Wrapper } = setup();
    const { result } = renderHook(
      () => ({ q: usePrBrief("p1"), m: useGenerateBrief("p1") }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.q.data).toBeDefined());
    expect(api.get).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.m.mutateAsync().catch(() => {});
    });
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(qc.getQueryData(prBriefKey("p1"))).toEqual(EMPTY);
  });

  it("AC-50: other errors do not refetch", async () => {
    vi.mocked(api.get).mockResolvedValue(EMPTY);
    vi.mocked(api.post).mockRejectedValue(new ApiError("boom", 502));
    const { Wrapper } = setup();
    const { result } = renderHook(
      () => ({ q: usePrBrief("p1"), m: useGenerateBrief("p1") }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.q.data).toBeDefined());
    await act(async () => {
      await result.current.m.mutateAsync().catch(() => {});
    });
    expect(api.get).toHaveBeenCalledTimes(1);
  });
});
