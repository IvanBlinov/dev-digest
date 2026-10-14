/* hooks/smart-diff.ts — React Query hook for the reviewer-ordered Files changed tab
   (GET /pulls/:id/smart-diff). */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { SmartDiffResponse } from "@devdigest/shared";

export const smartDiffKey = (prId: string | null | undefined) => ["smart-diff", prId] as const;

/** Files of a PR grouped by role (core → tests → wiring → docs → boilerplate). */
export function useSmartDiff(prId: string | null | undefined) {
  return useQuery({
    queryKey: smartDiffKey(prId),
    queryFn: () => api.get<SmartDiffResponse>(`/pulls/${prId}/smart-diff`),
    enabled: !!prId,
  });
}
