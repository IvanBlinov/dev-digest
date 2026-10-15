import { afterEach, describe, expect, it } from 'vitest';
import { connect, textOf } from '../helpers/connect';
import { MockDevDigestApi, conventionsState, repo } from '../mocks';

let close: (() => Promise<void>) | undefined;
afterEach(async () => close?.());

describe('get_conventions', () => {
  it('returns text for a known repo', async () => {
    const api = new MockDevDigestApi({ repos: [repo()], conventions: { 'repo-1': conventionsState() } });
    const c = await connect(api);
    close = c.close;
    const res = await c.client.callTool({ name: 'get_conventions', arguments: { repo: 'acme/payments-api' } });
    expect(res.isError).toBeFalsy();
    expect(textOf(res)).toContain('never starts extraction');
  });

  it('unknown repo -> isError', async () => {
    const c = await connect(new MockDevDigestApi({ repos: [repo()] }));
    close = c.close;
    const res = await c.client.callTool({ name: 'get_conventions', arguments: { repo: 'x/y' } });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('Known: acme/payments-api');
  });
});
