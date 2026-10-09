import type { IntentConfidence, IntentSourceStatus } from "@devdigest/shared";

export interface ToneColors {
  color: string;
  bg: string;
}

/** Badge colours per confidence level (never colour alone — the label is always shown). */
export function confidenceTone(c: IntentConfidence): ToneColors {
  if (c === "high") return { color: "var(--ok)", bg: "var(--ok-bg)" };
  if (c === "medium") return { color: "var(--info)", bg: "var(--info-bg)" };
  return { color: "var(--warn)", bg: "var(--warn-bg)" };
}

export function statusColor(status: IntentSourceStatus): string {
  return status === "ok" ? "var(--ok)" : "var(--warn)";
}
