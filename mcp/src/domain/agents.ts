import type { Agent } from '@devdigest/shared';

export interface AgentSummary {
  id: string;
  name: string;
  enabled: boolean;
  provider: string;
  model: string;
  description: string;
}

/** Field whitelist: the agent record carries `system_prompt`, which must never leave the API boundary. */
export function toAgentSummary(a: Agent): AgentSummary {
  return {
    id: a.id,
    name: a.name,
    enabled: a.enabled,
    provider: a.provider,
    model: a.model,
    description: a.description,
  };
}
