import type { AgentSummary } from '../domain/agents';
import { MAX_RESPONSE_CHARS, capItems, oneLine } from './text';

const DESCRIPTION_MAX = 100;

export function presentAgents(agents: AgentSummary[]): string {
  if (agents.length === 0) {
    return 'No review agents are configured in DevDigest. Create one in the DevDigest UI.';
  }
  const { text } = capItems(
    agents,
    (a) =>
      `- ${a.name} (${a.enabled ? 'enabled' : 'disabled'}) · ${a.provider}/${a.model} — ${oneLine(a.description, DESCRIPTION_MAX)}`,
    MAX_RESPONSE_CHARS - 300,
  );
  return `${agents.length} review agent(s). Pass a name to run_review to run one; omit it to run all enabled.\n${text}`;
}
