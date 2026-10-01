import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { OpenRouterProvider } from '../src/llm/openrouter';

/** The per-request timeout must reach the SDK call, or a slow model hangs a run for minutes. */
describe('OpenRouterProvider.completeStructured — per-request timeout', () => {
  function withFakeClient() {
    const provider = new OpenRouterProvider('test-key');
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: '{"ok":true}' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });
    (provider as unknown as { client: unknown }).client = { chat: { completions: { create } } };
    return { provider, create };
  }
  const req = {
    model: 'm',
    schema: z.object({ ok: z.boolean() }),
    schemaName: 'probe',
    messages: [{ role: 'user' as const, content: 'hi' }],
  };

  it('passes req.timeoutMs to the SDK request options', async () => {
    const { provider, create } = withFakeClient();
    await provider.completeStructured({ ...req, timeoutMs: 1234 });
    expect(create.mock.calls[0]![1]).toMatchObject({ timeout: 1234 });
  });

  it('keeps the client default when no timeout is given', async () => {
    const { provider, create } = withFakeClient();
    await provider.completeStructured(req);
    expect(create.mock.calls[0]![1]?.timeout).toBeUndefined();
  });
});
