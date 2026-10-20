/* hooks/blast.ts — React Query hook for a PR's blast radius (GET /pulls/:id/blast). */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { BlastRadius } from "@devdigest/shared";

export const blastKey = (prId: string | null | undefined) => ["blast", prId] as const;

/** Changed symbols, their callers (file:line) and the endpoints/crons behind them. */
export function useBlastRadius(prId: string | null | undefined) {
  return useQuery({
    queryKey: blastKey(prId),
    queryFn: () => api.get<BlastRadius>(`/pulls/${prId}/blast`),
    enabled: !!prId,
  });
}
