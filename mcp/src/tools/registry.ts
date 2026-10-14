import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgentsService } from '../services/agents-service';
import type { ConventionsService } from '../services/conventions-service';
import type { ReviewsService } from '../services/reviews-service';
import * as getBlastRadius from './get-blast-radius';
import * as getConventions from './get-conventions';
import * as getFindings from './get-findings';
import * as listAgents from './list-agents';
import * as runReview from './run-review';

export interface Services {
  agents: AgentsService;
  reviews: ReviewsService;
  conventions: ConventionsService;
}

export function registerTools(server: McpServer, services: Services): void {
  server.registerTool(listAgents.definition.name, listAgents.definition.config, listAgents.handler(services));
  server.registerTool(runReview.definition.name, runReview.definition.config, runReview.handler(services));
  server.registerTool(getFindings.definition.name, getFindings.definition.config, getFindings.handler(services));
  server.registerTool(getConventions.definition.name, getConventions.definition.config, getConventions.handler(services));
  server.registerTool(getBlastRadius.definition.name, getBlastRadius.definition.config, getBlastRadius.handler());
}
