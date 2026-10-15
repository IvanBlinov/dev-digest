import { afterEach, expect, it } from 'vitest';
import { connect, textOf } from '../helpers/connect';
import { MockDevDigestApi } from '../mocks';

let close: (() => Promise<void>) | undefined;
afterEach(async () => close?.());

it('get_blast_radius is a stub: isError, points at get_findings, makes no API call', async () => {
  const api = new MockDevDigestApi();
  const c = await connect(api);
  close = c.close;
  const res = await c.client.callTool({
    name: 'get_blast_radius',
    arguments: { repo: 'acme/payments-api', pr_number: 482 },
  });
  expect(res.isError).toBe(true);
  expect(textOf(res)).toContain('not implemented yet');
  expect(textOf(res)).toContain('get_findings');
  expect(api.calls).toEqual([]);
});
