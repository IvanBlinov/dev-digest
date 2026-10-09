import type { Finding } from '@devdigest/shared';
import { pickScopeSignal } from '@devdigest/reviewer-core';

/**
 * Cross-agent out-of-scope signal helpers (pure). Each agent of a review
 * execution yields at most ONE candidate; the executor keeps exactly one across
 * all agents. `order` is the agent's index in the job list, so the choice never
 * depends on which agent finished first.
 */

export interface ScopeComputation {
  /** Index of the agent's job in the execution (lower wins ties). */
  order: number;
  agentName: string;
  candidate: Finding | null;
}

export interface ScopePick {
  order: number;
  agentName: string;
  finding: Finding;
}

export function pickSignal(comps: ScopeComputation[]): { winner: ScopePick | null; losers: ScopePick[] } {
  const candidates: ScopePick[] = comps
    .filter((c): c is ScopeComputation & { candidate: Finding } => c.candidate !== null)
    .map((c) => ({ order: c.order, agentName: c.agentName, finding: c.candidate }));
  return pickScopeSignal(candidates);
}

export function signalDecisionLine(winner: ScopePick | null, droppedCandidates: number): string {
  if (!winner) return 'Out-of-scope signal: none';
  const f = winner.finding;
  return (
    `Out-of-scope signal: kept "${f.title}" (${f.severity} ${f.category}, conf ${f.confidence}) ` +
    `from agent "${winner.agentName}"; dropped ${droppedCandidates} other candidate(s)`
  );
}

export function waitingLine(otherAgents: number): string {
  return `Waiting for ${otherAgents} other agent(s) to choose this PR's out-of-scope signal…`;
}
