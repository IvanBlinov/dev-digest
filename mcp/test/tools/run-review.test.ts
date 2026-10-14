import { afterEach, describe, expect, it } from 'vitest';
import { connect, textOf } from '../helpers/connect';
import { MockDevDigestApi, agent, pr, repo } from '../mocks';

let close: (() => Promise<void>) | undefined;
afterEach(async () => close?.());

const fixtures = {
  repos: [repo()],
  pulls: { 'repo-1': [pr()] },
  agents: [agent(), agent({ id: 'agent-2', name: 'Style' })],
};

describe('run_review', () => {
  it('starts runs and returns run_ids at once', async () => {
    const api = new MockDevDigestApi(fixtures);
    const c = await connect(api);
    close = c.close;
    const res = await c.client.callTool({
      name: 'run_review',
      arguments: { repo: 'acme/payments-api', pr_number: 482 },
    });
    expect(res.isError).toBeFalsy();
    const text = textOf(res);
    expect(text).toContain('status: running');
    expect(text).toContain('run-1');
    expect(text).toContain('run-2');
    expect(api.callsTo('startReview')).toEqual([['pr-482', { all: true }]]);
  });

  it('unknown agent -> isError listing agent names', async () => {
    const c = await connect(new MockDevDigestApi(fixtures));
    close = c.close;
    const res = await c.client.callTool({
      name: 'run_review',
      arguments: { repo: 'acme/payments-api', pr_number: 482, agent: 'nope' },
    });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('Security, Style');
  });

  it('bad repo format -> isError from SDK validation', async () => {
    const api = new MockDevDigestApi(fixtures);
    const c = await connect(api);
    close = c.close;
    const res = await c.client.callTool({ name: 'run_review', arguments: { repo: 'not-a-repo', pr_number: 1 } });
    expect(res.isError).toBe(true);
    expect(api.calls).toHaveLength(0);
  });
});
