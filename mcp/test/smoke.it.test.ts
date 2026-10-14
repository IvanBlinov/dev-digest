import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

// Needs the seeded stack (./scripts/dev.sh). Never calls run_review, so no LLM cost.
const API_URL = process.env.DEVDIGEST_API_URL ?? 'http://localhost:3001';

async function apiIsUp(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

const up = await apiIsUp();

describe.skipIf(!up)('smoke against the seeded stack', () => {
  it('list_agents is non-empty and get_findings on acme/payments-api#482 is not an error', async () => {
    const transport = new StdioClientTransport({
      command: 'npx',
      args: ['tsx', 'src/server.ts'],
      cwd: join(__dirname, '..'),
      stderr: 'ignore',
      env: { PATH: process.env.PATH ?? '', DEVDIGEST_API_URL: API_URL },
    });
    const client = new Client({ name: 'smoke', version: '0.0.0' });
    try {
      await client.connect(transport);
      const agents = await client.callTool({ name: 'list_agents', arguments: {} });
      expect(agents.isError).toBeFalsy();
      expect(JSON.stringify(agents.content)).toContain('enabled');
      const findings = await client.callTool({
        name: 'get_findings',
        arguments: { repo: 'acme/payments-api', pr_number: 482 },
      });
      expect(findings.isError).toBeFalsy();
    } finally {
      await client.close();
    }
  }, 60_000);
});
