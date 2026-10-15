import type { RunOutcome } from '../domain/findings';
import { NAME_MAX, oneLine, untrustedInline } from './text';

export function presentStarted(input: {
  label: string;
  runs: { runId: string; agentName: string }[];
}): string {
  const lines = input.runs.map((r) => `- ${oneLine(r.agentName, NAME_MAX)}: run_id ${r.runId}`);
  return [
    `Started ${input.runs.length} review run(s) on ${input.label} (status: running).`,
    ...lines,
    'Next: call get_findings with the same repo and pr_number (add run_id for one run) in ~60s.',
  ].join('\n');
}

const ERROR_MAX = 500;

/** Text for any non-done outcome of a single run. */
export function presentRunStatus(input: {
  label: string;
  runId: string;
  agentName: string;
  outcome: Exclude<RunOutcome, { status: 'done' }>;
}): string {
  const head = `Run ${input.runId} (${oneLine(input.agentName, NAME_MAX)}) on ${input.label}`;
  const o = input.outcome;
  switch (o.status) {
    case 'running':
      return `${head}: status running (~${o.ageSec}s so far). No findings yet — call again in ~30s.`;
    case 'finishing':
      return `${head}: status finishing — results are being saved. Call again in ~10s.`;
    case 'failed':
      return `${head}: status failed${o.error ? ` — ${untrustedInline('error', o.error, ERROR_MAX)}` : ''}. Fix the cause and call run_review again.`;
    case 'cancelled':
      return `${head}: status cancelled${o.error ? ` — ${untrustedInline('error', o.error, ERROR_MAX)}` : ''}.`;
  }
}
