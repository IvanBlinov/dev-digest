import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { HttpDevDigestApi } from './api/http-client';
import type { DevDigestApi } from './api/port';
import type { Config } from './config';
import { INSTRUCTIONS } from './instructions';
import { AgentsService } from './services/agents-service';
import { BlastService } from './services/blast-service';
import { ConventionsService } from './services/conventions-service';
import { PrResolver } from './services/pr-resolver';
import { ReviewsService } from './services/reviews-service';
import { registerTools } from './tools/registry';

const SERVER_VERSION = '0.1.0';

export interface CreateServerOptions {
  config: Config;
  /** Tests inject a mock; production leaves it unset and gets the HTTP client. */
  api?: DevDigestApi;
  clock?: () => number;
}

/** Composition root: the only place that builds the edge adapter and wires services into tools. */
export function createServer(options: CreateServerOptions): McpServer {
  const clock = options.clock ?? Date.now;
  const api = options.api ?? new HttpDevDigestApi(options.config);
  const resolver = new PrResolver(api, clock);
  const server = new McpServer(
    { name: 'devdigest', version: SERVER_VERSION },
    { instructions: INSTRUCTIONS },
  );
  registerTools(server, {
    agents: new AgentsService(api),
    reviews: new ReviewsService(api, resolver, clock),
    conventions: new ConventionsService(api, resolver),
    blast: new BlastService(api, resolver),
  });
  return server;
}
