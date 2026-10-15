import type { DevDigestApi } from '../api/port';
import { toAgentSummary, type AgentSummary } from '../domain/agents';

export class AgentsService {
  constructor(private readonly api: DevDigestApi) {}

  async list(): Promise<AgentSummary[]> {
    return (await this.api.listAgents()).map(toAgentSummary);
  }
}
