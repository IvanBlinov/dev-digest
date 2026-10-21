/* hooks/brief.ts — React Query hooks for the PR Brief (GET/POST /pulls/:id/brief). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import type { PrBriefResponse } from "@devdigest/shared";

export const prBriefKey = (prId: string | null | undefined) => ["pr-brief", prId] as const;

/** The stored brief (or `{brief: null}` before the first generation). Reading never calls the model. */
export function usePrBrief(prId: string | null | undefined) {
  return useQuery({
    queryKey: prBriefKey(prId),
    queryFn: () => api.get<PrBriefResponse>(`/pulls/${prId}/brief`),
    enabled: !!prId,
  });
}

/**
 * Generate (or regenerate) now. Errors are shown inline by the brief card, so the global
 * MutationCache toast is skipped (`meta.silentError`). A 409 means another tab is generating:
 * refetch the stored brief instead of surfacing a failure.
 */
export function useGenerateBrief(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrBriefResponse>(`/pulls/${prId}/brief`),
    meta: { silentError: true },
    onSuccess: (res) => {
      qc.setQueryData(prBriefKey(prId), res);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        qc.invalidateQueries({ queryKey: prBriefKey(prId) });
      }
    },
  });
}
