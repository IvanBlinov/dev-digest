import type { RunEvent } from "@devdigest/shared";
import type { LogLine } from "@devdigest/ui";

/** queued = stream open but the agent hasn't started (waiting for a concurrency slot). */
export type AgentRunStatus = "queued" | "running" | "done" | "failed";

export interface LiveRun {
  runId: string;
  agentName: string | null;
}

export interface AgentLogGroup {
  runId: string;
  agentName: string;
  status: AgentRunStatus;
  lines: LogLine[];
  last: LogLine | null;
}

const toLine = (e: RunEvent): LogLine => ({ t: e.t, k: e.kind as LogLine["k"], m: e.msg });

/**
 * Split a merged multi-run live log into the shared preparation lines (events fanned out to
 * every run — already de-duplicated by `appendRunEvent`) and one group per agent run, in the
 * order the runs were started. A run's status comes from its own stream.
 */
export function groupRunLog(
  events: readonly RunEvent[],
  runs: readonly LiveRun[],
  openRunIds: ReadonlySet<string>,
): { shared: LogLine[]; agents: AgentLogGroup[] } {
  const seen = new Set<string>();
  const shared = events
    .filter((e) => e.shared && !seen.has(e.shared) && seen.add(e.shared))
    .map(toLine);
  const agents = runs.map(({ runId, agentName }) => {
    const own = events.filter((e) => !e.shared && e.runId === runId);
    const lines = own.map(toLine);
    const failed = own.some((e) => e.kind === "error");
    const open = openRunIds.has(runId);
    const status: AgentRunStatus = open ? (lines.length === 0 ? "queued" : "running") : failed ? "failed" : "done";
    return { runId, agentName: agentName ?? runId.slice(0, 8), status, lines, last: lines.at(-1) ?? null };
  });
  return { shared, agents };
}
