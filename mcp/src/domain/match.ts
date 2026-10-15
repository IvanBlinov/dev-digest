import type { Agent, PrMeta, Repo } from '@devdigest/shared';
import {
  AgentNotFoundError,
  AmbiguousAgentError,
  PrNotImportedError,
  RepoNotFoundError,
} from './errors';

const MAX_KNOWN_REPOS = 10;

export type AgentTarget = { kind: 'all' } | { kind: 'one'; agentId: string };

export function matchRepo(repos: Repo[], fullName: string): Repo {
  const wanted = fullName.toLowerCase();
  const found = repos.find((r) => r.full_name.toLowerCase() === wanted);
  if (!found) {
    throw new RepoNotFoundError(
      fullName,
      repos.slice(0, MAX_KNOWN_REPOS).map((r) => r.full_name),
    );
  }
  return found;
}

/** Returns the PR with a guaranteed `id`; a PR the API lists but has not persisted is "not imported". */
export function matchPr(pulls: PrMeta[], repoFullName: string, prNumber: number): PrMeta & { id: string } {
  const found = pulls.find((p) => p.number === prNumber);
  if (!found || !found.id) throw new PrNotImportedError(repoFullName, prNumber);
  return { ...found, id: found.id };
}

export function matchAgent(agents: Agent[], query: string | undefined): AgentTarget {
  if (query === undefined || query.trim() === '') return { kind: 'all' };
  const byId = agents.find((a) => a.id === query);
  if (byId) return { kind: 'one', agentId: byId.id };
  const wanted = query.trim().toLowerCase();
  const byName = agents.filter((a) => a.name.toLowerCase() === wanted);
  if (byName.length > 1) {
    throw new AmbiguousAgentError(byName.map((a) => ({ name: a.name, id: a.id })));
  }
  const only = byName[0];
  if (!only) throw new AgentNotFoundError(query, agents.map((a) => a.name));
  return { kind: 'one', agentId: only.id };
}
