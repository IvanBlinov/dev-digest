import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Config } from '../../src/config';
import { createServer } from '../../src/create-server';
import { MockDevDigestApi } from '../mocks';

export const TEST_CONFIG: Config = { apiUrl: 'http://api.test:3001', timeoutMs: 5000 };

/** Connects an in-memory MCP client to a server wired to the given mock API. */
export async function connect(api: MockDevDigestApi = new MockDevDigestApi(), clock?: () => number) {
  const server = createServer({ config: TEST_CONFIG, api, ...(clock ? { clock } : {}) });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return {
    api,
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

export function textOf(result: unknown): string {
  const content = (result as { content?: { type: string; text?: string }[] }).content ?? [];
  return content.map((c) => c.text ?? '').join('\n');
}
