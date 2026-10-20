import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { OnboardingTourState } from "@devdigest/shared";

vi.mock("../api", async (o) => ({
  ...(await o<typeof import("../api")>()),
  api: { get: vi.fn(), post: vi.fn() },
}));

import { api, ApiError } from "../api";
import {
  ONBOARDING_CLONE_POLL_MAX_MS,
  ONBOARDING_POLL_MS,
  onboardingKey,
  useGenerateOnboarding,
  useOnboardingTour,
} from "./onboarding";
import { useRefreshRepo } from "./core";
import { tourState } from "../../app/repos/[repoId]/onboarding/test-fixtures";

const NOT_CLONED = tourState({ status: "none", cloned: false, tour: null, index_updated_at: null });
const GENERATING = tourState({ status: "generating" });
const READY = tourState();

function makeWrapper(qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return { Wrapper, qc };
}

function getCalls(path: string): number {
  return vi.mocked(api.get).mock.calls.filter((c) => c[0] === path).length;
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function serve(state: () => OnboardingTourState) {
  vi.mocked(api.get).mockImplementation(async () => state());
}

beforeEach(() => {
  vi.resetAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useOnboardingTour", () => {
  it("AC-68: a rejected GET surfaces as isError", async () => {
    vi.mocked(api.get).mockRejectedValue(new ApiError("boom", 500));
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useOnboardingTour("r1"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("GETs /repos/r1/onboarding and returns the state", async () => {
    serve(() => READY);
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useOnboardingTour("r1"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toEqual(READY));
    expect(api.get).toHaveBeenCalledWith("/repos/r1/onboarding");
    expect(result.current.clonePollTimedOut).toBe(false);
  });

  it("AC-53: refetches every 2000 ms while generating and stops after ready", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    expect(ONBOARDING_POLL_MS).toBe(2000);
    let state = GENERATING;
    serve(() => state);
    const { Wrapper } = makeWrapper();
    renderHook(() => useOnboardingTour("r1"), { wrapper: Wrapper });
    await advance(0);
    expect(getCalls("/repos/r1/onboarding")).toBe(1);
    await advance(2000);
    expect(getCalls("/repos/r1/onboarding")).toBe(2);
    state = READY;
    await advance(2000);
    expect(getCalls("/repos/r1/onboarding")).toBe(3);
    await advance(10_000);
    expect(getCalls("/repos/r1/onboarding")).toBe(3);
  });

  it("AC-50: pollUntilCloned polls every 2000 ms while cloned is false and stops once cloned", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let state = NOT_CLONED;
    serve(() => state);
    const { Wrapper } = makeWrapper();
    renderHook(() => useOnboardingTour("r1", { pollUntilCloned: true }), { wrapper: Wrapper });
    await advance(0);
    expect(getCalls("/repos/r1/onboarding")).toBe(1);
    await advance(2000);
    await advance(2000);
    expect(getCalls("/repos/r1/onboarding")).toBe(3);
    state = tourState({ status: "none", cloned: true, tour: null });
    await advance(2000);
    expect(getCalls("/repos/r1/onboarding")).toBe(4);
    await advance(10_000);
    expect(getCalls("/repos/r1/onboarding")).toBe(4);
  });

  it("AC-50: pollUntilCloned false → no polling while cloned is false", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    serve(() => NOT_CLONED);
    const { Wrapper } = makeWrapper();
    renderHook(() => useOnboardingTour("r1", { pollUntilCloned: false }), { wrapper: Wrapper });
    await advance(0);
    await advance(10_000);
    expect(getCalls("/repos/r1/onboarding")).toBe(1);
  });

  it("R6: the clone poll stops after ONBOARDING_CLONE_POLL_MAX_MS (600000) and clonePollTimedOut becomes true", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    expect(ONBOARDING_CLONE_POLL_MAX_MS).toBe(600_000);
    serve(() => NOT_CLONED);
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useOnboardingTour("r1", { pollUntilCloned: true }), {
      wrapper: Wrapper,
    });
    await advance(60_000);
    expect(result.current.clonePollTimedOut).toBe(false);
    await advance(540_000);
    await advance(10_000);
    const after = getCalls("/repos/r1/onboarding");
    expect(result.current.clonePollTimedOut).toBe(true);
    await advance(10_000);
    expect(getCalls("/repos/r1/onboarding")).toBe(after);
  });

  it("R6: the clone poll stops on unmount", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    serve(() => NOT_CLONED);
    const { Wrapper } = makeWrapper();
    const { unmount } = renderHook(() => useOnboardingTour("r1", { pollUntilCloned: true }), {
      wrapper: Wrapper,
    });
    await advance(4000);
    unmount();
    const before = getCalls("/repos/r1/onboarding");
    await advance(10_000);
    expect(getCalls("/repos/r1/onboarding")).toBe(before);
  });

  it("R6: a repo change moves the poll", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    serve(() => NOT_CLONED);
    const { Wrapper } = makeWrapper();
    const { rerender, result } = renderHook(
      ({ id }: { id: string }) => useOnboardingTour(id, { pollUntilCloned: true }),
      { wrapper: Wrapper, initialProps: { id: "r1" } },
    );
    await advance(500_000);
    rerender({ id: "r2" });
    await advance(0);
    expect(getCalls("/repos/r2/onboarding")).toBeGreaterThan(0);
    const r1 = getCalls("/repos/r1/onboarding");
    // 200 s after the switch the old window (started 700 s ago) would have run out; r2's must not have.
    await advance(200_000);
    expect(getCalls("/repos/r1/onboarding")).toBe(r1);
    expect(result.current.clonePollTimedOut).toBe(false);
    const r2 = getCalls("/repos/r2/onboarding");
    await advance(4000);
    expect(getCalls("/repos/r2/onboarding")).toBeGreaterThan(r2);
  });
});

describe("useRefreshRepo (the AC-50 clone action)", () => {
  it("AC-50: useRefreshRepo (from ./core) mutate('r1') posts /repos/r1/refresh and never /repos/r1/resync", async () => {
    vi.mocked(api.post).mockResolvedValue({});
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useRefreshRepo(), { wrapper: Wrapper });
    await act(async () => {
      result.current.mutate("r1");
    });
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const paths = vi.mocked(api.post).mock.calls.map((c) => c[0]);
    expect(paths).toContain("/repos/r1/refresh");
    expect(paths).not.toContain("/repos/r1/resync");
  });
});

describe("useGenerateOnboarding", () => {
  it("AC-54: 202 → 'started', cached status generating, tour kept", async () => {
    vi.mocked(api.post).mockResolvedValue({ status: "generating" });
    const { Wrapper, qc } = makeWrapper();
    qc.setQueryData(onboardingKey("r1"), READY);
    const { result } = renderHook(() => useGenerateOnboarding("r1"), { wrapper: Wrapper });
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.mutateAsync();
    });
    expect(outcome).toBe("started");
    expect(api.post).toHaveBeenCalledWith("/repos/r1/onboarding/generate");
    const cached = qc.getQueryData<OnboardingTourState>(onboardingKey("r1"));
    expect(cached?.status).toBe("generating");
    expect(cached?.tour).toEqual(READY.tour);
  });

  it("AC-54: 409 onboarding_generation_running → 'running', cached status generating, no rejection", async () => {
    vi.mocked(api.post).mockRejectedValue(
      new ApiError("already running", 409, "onboarding_generation_running"),
    );
    const { Wrapper, qc } = makeWrapper();
    qc.setQueryData(onboardingKey("r1"), READY);
    const { result } = renderHook(() => useGenerateOnboarding("r1"), { wrapper: Wrapper });
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.mutateAsync();
    });
    expect(outcome).toBe("running");
    expect(qc.getQueryData<OnboardingTourState>(onboardingKey("r1"))?.status).toBe("generating");
  });

  it("AC-54: 429 → 'rate_limited', cache unchanged, no rejection", async () => {
    vi.mocked(api.post).mockRejectedValue(new ApiError("slow down", 429, "rate_limited"));
    const { Wrapper, qc } = makeWrapper();
    qc.setQueryData(onboardingKey("r1"), READY);
    const { result } = renderHook(() => useGenerateOnboarding("r1"), { wrapper: Wrapper });
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.mutateAsync();
    });
    expect(outcome).toBe("rate_limited");
    expect(qc.getQueryData<OnboardingTourState>(onboardingKey("r1"))).toEqual(READY);
  });

  it("409 repo_not_cloned → the mutation rejects", async () => {
    vi.mocked(api.post).mockRejectedValue(new ApiError("not cloned", 409, "repo_not_cloned"));
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useGenerateOnboarding("r1"), { wrapper: Wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toMatchObject({ code: "repo_not_cloned" });
    });
  });
});

describe("onboardingKey", () => {
  it("EC-14: onboardingKey differs per repo", () => {
    expect(onboardingKey("r1")).toEqual(["onboarding", "r1"]);
    expect(onboardingKey("r1")).not.toEqual(onboardingKey("r2"));
  });
});
