import type { RepoIntelState } from "@/lib/hooks/repo-intel";

export interface IndexStateInput {
  data?: RepoIntelState;
  isLoading: boolean;
  isError: boolean;
}

/** Key under `onboarding.indexStatus.*` for the index status line (AC-50). */
export function indexStatusKey(
  input: IndexStateInput,
): "full" | "partial" | "degraded" | "notIndexed" | "failed" | "loading" | "unknown" {
  if (input.isLoading) return "loading";
  if (input.isError || !input.data) return "unknown";
  const { status, reason, degradedReason } = input.data;
  if (status === "degraded" && (reason === "no_data" || degradedReason === "no_data")) return "notIndexed";
  return status;
}
