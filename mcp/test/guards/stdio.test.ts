import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { describe, expect, it } from 'vitest';

const MCP_DIR = join(__dirname, '../..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('stdout is reserved for JSON-RPC', () => {
  it('src has no console.log / process.stdout.write', () => {
    const offenders = walk(join(MCP_DIR, 'src')).filter((f) =>
      /console\.log\s*\(|process\.stdout\.write/.test(readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '')),
    );
    expect(offenders).toEqual([]);
  });

  it('a spawned server answers tools/list over stdio', async () => {
    const transport = new StdioClientTransport({
      command: 'npx',
      args: ['tsx', 'src/server.ts'],
      cwd: MCP_DIR,
      stderr: 'ignore',
      // Unreachable API on purpose: the session must start without a health check.
      env: { PATH: process.env.PATH ?? '', DEVDIGEST_API_URL: 'http://127.0.0.1:9' },
    });
    const client = new Client({ name: 'stdio-test', version: '0.0.0' });
    try {
      await client.connect(transport);
      const { tools } = await client.listTools();
      expect(tools).toHaveLength(5);
    } finally {
      await client.close();
    }
  }, 30_000);
});
