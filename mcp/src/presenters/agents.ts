import type { AgentSummary } from '../domain/agents';
import { MAX_RESPONSE_CHARS, NAME_MAX, capItems, oneLine } from './text';

const DESCRIPTION_MAX = 100;
const MODEL_MAX = 100;

export function presentAgents(agents: AgentSummary[]): string {
  if (agents.length === 0) {
    return 'No review agents are configured in DevDigest. Create one in the DevDigest UI.';
  }
  const { text } = capItems(
    agents,
    (a) =>
      `- ${oneLine(a.name, NAME_MAX)} (${a.enabled ? 'enabled' : 'disabled'}) · ${oneLine(a.provider, NAME_MAX)}/${oneLine(a.model, MODEL_MAX)} — ${oneLine(a.description, DESCRIPTION_MAX)}`,
    MAX_RESPONSE_CHARS - 300,
  );
  return `${agents.length} review agent(s). Pass a name to run_review to run one; omit it to run all enabled.\n${text}`;
}
