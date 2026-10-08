import type { ConventionCandidate, ConventionsState } from "@devdigest/shared";

/** Which scan button to show (req 45): Run Scan before the first scan, ReScan after, Scanning… while running. */
export type ScanButtonMode = "run" | "rescan" | "scanning";

export function scanButtonMode(state: ConventionsState | undefined, starting: boolean): ScanButtonMode {
  if (starting || state?.scan?.status === "running") return "scanning";
  return state?.scan ? "rescan" : "run";
}

export const acceptedIds = (candidates: readonly ConventionCandidate[]): string[] =>
  candidates.filter((c) => c.status === "accepted").map((c) => c.id);
