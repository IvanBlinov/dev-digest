import { presentAgents } from '../presenters/agents';
import { ok, runTool } from './tool-result';
import type { Services } from './registry';
import { ListAgentsInput } from './schemas';

export const definition = {
  name: 'list_agents',
  config: {
    title: 'List review agents',
    description:
      'List DevDigest review agents with name, enabled flag, model and focus. Pass a name to run_review to run one agent; omit it to run all enabled agents.',
    inputSchema: ListAgentsInput,
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
};

export const handler = (services: Services) => () =>
  runTool(async () => ok(presentAgents(await services.agents.list())));
