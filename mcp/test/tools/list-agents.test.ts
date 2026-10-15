import { afterEach, describe, expect, it } from 'vitest';
import { ApiUnreachableError } from '../../src/api/errors';
import { connect, textOf } from '../helpers/connect';
import { MockDevDigestApi, agent } from '../mocks';

let close: (() => Promise<void>) | undefined;
afterEach(async () => close?.());

describe('list_agents', () => {
  it('lists names and enabled flag without prompt text', async () => {
    const api = new MockDevDigestApi({ agents: [agent(), agent({ id: 'a2', name: 'Style', enabled: false })] });
    const c = await connect(api);
    close = c.close;
    const res = await c.client.callTool({ name: 'list_agents', arguments: {} });
    expect(res.isError).toBeFalsy();
    const text = textOf(res);
    expect(text).toContain('Security (enabled)');
    expect(text).toContain('Style (disabled)');
    expect(text).not.toContain('SECRET SYSTEM PROMPT');
  });

  it('maps an unreachable API to an actionable error', async () => {
    const api = new MockDevDigestApi().failWith('listAgents', new ApiUnreachableError('http://x:1'));
    const c = await connect(api);
    close = c.close;
    const res = await c.client.callTool({ name: 'list_agents', arguments: {} });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('./scripts/dev.sh');
  });
});
