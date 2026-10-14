import type { RunOutcome } from '../domain/findings';
import { oneLine } from './text';

export function presentStarted(input: {
  label: string;
  runs: { runId: string; agentName: string }[];
}): string {
  const lines = input.runs.map((r) => `- ${r.agentName}: run_id ${r.runId}`);
  return [
    `Started ${input.runs.length} review run(s) on ${input.label} (status: running).`,
    ...lines,
    'Next: call get_findings with the same repo and pr_number (add run_id for one run) in ~60s.',
  ].join('\n');
}

/** Text for any non-done outcome of a single run. */
export function presentRunStatus(input: {
  label: string;
  runId: string;
  agentName: string;
  outcome: Exclude<RunOutcome, { status: 'done' }>;
}): string {
  const head = `Run ${input.runId} (${input.agentName}) on ${input.label}`;
  const o = input.outcome;
  switch (o.status) {
    case 'running':
      return `${head}: status running (~${o.ageSec}s so far). No findings yet — call again in ~30s.`;
    case 'finishing':
      return `${head}: status finishing — results are being saved. Call again in ~10s.`;
    case 'failed':
      return `${head}: status failed${o.error ? ` — ${oneLine(o.error, 500)}` : ''}. Fix the cause and call run_review again.`;
    case 'cancelled':
      return `${head}: status cancelled${o.error ? ` — ${oneLine(o.error, 500)}` : ''}.`;
  }
}
