/* hooks/intent.ts — React Query hooks for the PR Intent card (GET/POST /pulls/:id/intent). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { PrIntentResponse } from "@devdigest/shared";

export const prIntentKey = (prId: string | null | undefined) => ["pr-intent", prId] as const;

/** The stored intent (or `{intent: null}` before the first detection), with a server-derived `stale` flag. */
export function usePrIntent(prId: string | null | undefined) {
  return useQuery({
    queryKey: prIntentKey(prId),
    queryFn: () => api.get<PrIntentResponse>(`/pulls/${prId}/intent`),
    enabled: !!prId,
  });
}

/** (Re)classify now. Errors are toasted globally by the app's MutationCache. */
export function useDetectIntent(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrIntentResponse>(`/pulls/${prId}/intent`),
    onSuccess: (res) => {
      qc.setQueryData(prIntentKey(prId), res);
    },
  });
}
