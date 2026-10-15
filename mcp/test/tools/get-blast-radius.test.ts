import { afterEach, describe, expect, it } from 'vitest';
import { connect, textOf } from '../helpers/connect';
import { MockDevDigestApi, blastRadius, pr, repo } from '../mocks';

let close: (() => Promise<void>) | undefined;
afterEach(async () => close?.());

const seeded = (blast = blastRadius()) =>
  new MockDevDigestApi({ repos: [repo()], pulls: { 'repo-1': [pr()] }, blast: { 'pr-482': blast } });

const call = async (api: MockDevDigestApi, args: Record<string, unknown> = {}) => {
  const c = await connect(api);
  close = c.close;
  return c.client.callTool({
    name: 'get_blast_radius',
    arguments: { repo: 'acme/payments-api', pr_number: 482, ...args },
  });
};

describe('get_blast_radius', () => {
  it('returns the summary, callers as file:line and endpoints', async () => {
    const api = seeded();
    const res = await call(api);
    expect(res.isError).toBeFalsy();
    const text = textOf(res);
    expect(text).toContain('2 changed symbols, 2 callers, 1 endpoint, 1 cron');
    expect(text).toContain('src/a.ts:12');
    expect(text).toContain('GET /refunds');
    expect(api.callsTo('getBlastRadius')).toEqual([['pr-482']]);
  });

  it('unknown PR -> isError pointing at the UI', async () => {
    const res = await call(seeded(), { pr_number: 999 });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('import/sync it in the UI');
  });

  it('degraded index shows the reason', async () => {
    const res = await call(seeded(blastRadius({ degraded: true, reason: 'no_data' })));
    expect(textOf(res)).toContain('no_data');
  });

  it('file filter limits the symbols', async () => {
    const res = await call(seeded(), { file: 'src/lib/money.ts' });
    const text = textOf(res);
    expect(text).toContain('formatMoney');
    expect(text).not.toContain('parseMoney');
  });
});
