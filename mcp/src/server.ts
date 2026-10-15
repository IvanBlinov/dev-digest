import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config';
import { createServer } from './create-server';
import { log } from './log';

/** Entry point: no wiring of its own (see create-server.ts). stdout carries JSON-RPC only. */
async function main(): Promise<void> {
  const config = loadConfig();
  const server = createServer({ config });
  await server.connect(new StdioServerTransport());
  log.info('devdigest mcp server ready', { apiUrl: config.apiUrl });
}

main().catch((e: unknown) => {
  log.error('fatal', { error: e instanceof Error ? (e.stack ?? e.message) : String(e) });
  process.exit(1);
});
