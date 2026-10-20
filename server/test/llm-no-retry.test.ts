import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { z } from 'zod';
import { OpenRouterProvider } from '@devdigest/reviewer-core';
import { OpenAIProvider } from '../src/adapters/llm/openai.js';
import { AnthropicProvider } from '../src/adapters/llm/anthropic.js';
import { MockSecretsProvider } from '../src/adapters/mocks.js';
import { Container } from '../src/platform/container.js';
import { loadConfig } from '../src/platform/config.js';

/** A local endpoint that always answers 500 and counts hits. */
let server: Server;
let baseUrl: string;
let hits = 0;

beforeAll(async () => {
  server = createServer((req, res) => {
    hits += 1;
    req.resume();
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end('{"error":{"message":"boom"}}');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise((r) => server.close(r));
});
beforeEach(() => {
  hits = 0;
});

const schema = z.object({ ok: z.boolean() });
const req = {
  model: 'm',
  schema,
  schemaName: 'T',
  messages: [{ role: 'user' as const, content: 'hi' }],
  maxRetries: 0,
  timeoutMs: 20_000,
};

describe('no-retry LLM provider instances (L05b)', () => {
  it('AC-14: OpenAIProvider with retries 0 sends one request on a 500', async () => {
    const p = new OpenAIProvider('k', { retries: 0, baseURL: `${baseUrl}/v1` });
    await expect(p.completeStructured(req)).rejects.toThrow();
    expect(hits).toBe(1);
  }, 30_000);

  it('AC-14: AnthropicProvider with retries 0 sends one request', async () => {
    const p = new AnthropicProvider('k', { retries: 0, baseURL: baseUrl });
    await expect(p.completeStructured(req)).rejects.toThrow();
    expect(hits).toBe(1);
  }, 30_000);

  it('AC-14: OpenRouterProvider with maxRetries 0 and req.maxRetries 0 sends one request', async () => {
    const p = new OpenRouterProvider('k', { baseURL: `${baseUrl}/v1`, maxRetries: 0 });
    await expect(p.completeStructured(req)).rejects.toThrow();
    expect(hits).toBe(1);
  }, 30_000);

  it("container.llm('openrouter', {retries: 0}) is not the cached default instance", async () => {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const container = new Container(config, {} as never, {
      secrets: new MockSecretsProvider({ OPENROUTER_API_KEY: 'k' }),
    });
    const dflt = await container.llm('openrouter');
    const noRetry = await container.llm('openrouter', { retries: 0 });
    expect(noRetry).not.toBe(dflt);
    expect(await container.llm('openrouter')).toBe(dflt);
    expect(await container.llm('openrouter', { retries: 0 })).toBe(noRetry);
  });
});
