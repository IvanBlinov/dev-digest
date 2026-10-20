/* hooks/onboarding.ts — React Query hooks for the L05b Onboarding Tour screen
   (/repos/:repoId/onboarding). Type-only imports from @devdigest/shared. */
"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { OnboardingGenerateResponse, OnboardingTourState } from "@devdigest/shared";
import { api, ApiError } from "../api";

/** Poll interval (ms) while generating or while waiting for a clone. */
export const ONBOARDING_POLL_MS = 2_000;
/** The clone poll gives up after this long (R6). */
export const ONBOARDING_CLONE_POLL_MAX_MS = 600_000;

export const onboardingKey = (repoId: string | null | undefined) => ["onboarding", repoId] as const;

export function isTourGenerating(state: OnboardingTourState | undefined): boolean {
  return state?.status === "generating";
}

export interface UseOnboardingTourOptions {
  pollUntilCloned?: boolean;
}

export function useOnboardingTour(repoId: string | null | undefined, opts: UseOnboardingTourOptions = {}) {
  const pollUntilCloned = opts.pollUntilCloned === true;
  const windowStart = useRef<number | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  // Restart the clone-poll window whenever the repo changes or polling is switched on.
  useEffect(() => {
    windowStart.current = null;
    setTimedOut(false);
    if (!pollUntilCloned) return;
    windowStart.current = Date.now();
    const timer = setTimeout(() => setTimedOut(true), ONBOARDING_CLONE_POLL_MAX_MS);
    return () => clearTimeout(timer);
  }, [repoId, pollUntilCloned]);

  const query = useQuery({
    queryKey: onboardingKey(repoId),
    queryFn: () => api.get<OnboardingTourState>(`/repos/${repoId}/onboarding`),
    enabled: !!repoId,
    refetchInterval: (q) => {
      const data = q.state.data;
      if (isTourGenerating(data)) return ONBOARDING_POLL_MS;
      if (pollUntilCloned && data && !data.cloned) {
        const start = windowStart.current ?? Date.now();
        return Date.now() - start < ONBOARDING_CLONE_POLL_MAX_MS ? ONBOARDING_POLL_MS : false;
      }
      return false;
    },
  });

  return { ...query, clonePollTimedOut: pollUntilCloned && timedOut && query.data?.cloned === false };
}

export type GenerateOutcome = "started" | "running" | "rate_limited";

/** Start a generation. 409-running and 429 resolve as outcomes (the global mutation toast would
 *  otherwise fire); every other error rejects. */
export function useGenerateOnboarding(repoId: string | null | undefined) {
  const qc = useQueryClient();
  const key = onboardingKey(repoId);
  const markGenerating = () => {
    qc.setQueryData<OnboardingTourState>(key, (prev) =>
      prev ? { ...prev, status: "generating" } : prev,
    );
    void qc.invalidateQueries({ queryKey: key });
  };
  return useMutation<GenerateOutcome, Error, void>({
    mutationFn: async () => {
      try {
        await api.post<OnboardingGenerateResponse>(`/repos/${repoId}/onboarding/generate`);
        return "started";
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 409 && err.code === "onboarding_generation_running") return "running";
          if (err.status === 429) return "rate_limited";
        }
        throw err;
      }
    },
    onSuccess: (outcome) => {
      if (outcome === "started" || outcome === "running") markGenerating();
    },
  });
}
