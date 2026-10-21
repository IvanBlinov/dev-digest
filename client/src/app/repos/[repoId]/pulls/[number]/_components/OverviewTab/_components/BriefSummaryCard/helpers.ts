import type { BriefInput } from "@devdigest/shared";
import { ApiError } from "@/lib/api";

const MISSING_STATUSES = new Set<BriefInput["status"]>(["missing", "unavailable", "degraded", "stale"]);

/** Inputs the model did not get in full: missing, unavailable, degraded or stale (truncated is not one). */
export function missingInputs(inputs: BriefInput[]): BriefInput[] {
  return inputs.filter((i) => MISSING_STATUSES.has(i.status));
}

export interface BuiltFromFormat {
  kind: (kind: BriefInput["kind"]) => string;
  filesShown: (shown: number, total: number) => string;
  blastDegraded: (reason: string) => string;
}

/** One token per input that reached the model, with partial counts and degradation reasons spelled out. */
export function builtFromLine(inputs: BriefInput[], fmt: BuiltFromFormat): string[] {
  const out: string[] = [];
  for (const i of inputs) {
    if (i.status === "missing" || i.status === "unavailable") continue;
    if (i.kind === "files" && i.shown != null && i.total != null && i.shown !== i.total) {
      out.push(fmt.filesShown(i.shown, i.total));
    } else if (i.kind === "blast" && i.status === "degraded" && i.reason) {
      out.push(fmt.blastDegraded(i.reason));
    } else {
      out.push(fmt.kind(i.kind));
    }
  }
  return out;
}

export type BriefErrorView =
  | { kind: "rateLimited"; seconds: number }
  | { kind: "inProgress" }
  | { kind: "noFiles" }
  | { kind: "config" }
  | { kind: "generic" };

/** Map a failed POST to the inline message the card shows. */
export function briefErrorView(error: ApiError): BriefErrorView {
  if (error.status === 429) {
    const secs = (error.details as { retry_after_s?: unknown } | undefined)?.retry_after_s;
    return { kind: "rateLimited", seconds: typeof secs === "number" ? secs : 0 };
  }
  if (error.status === 409 || error.code === "brief_in_progress") return { kind: "inProgress" };
  if (error.status === 422 || error.code === "brief_no_files") return { kind: "noFiles" };
  if (error.code === "config_error") return { kind: "config" };
  return { kind: "generic" };
}
