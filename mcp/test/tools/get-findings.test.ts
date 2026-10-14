import { afterEach, describe, expect, it } from 'vitest';
import { connect, textOf } from '../helpers/connect';
import { MockDevDigestApi, agent, finding, pr, repo, review, run } from '../mocks';

let close: (() => Promise<void>) | undefined;
afterEach(async () => close?.());

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const base = { repos: [repo()], pulls: { 'repo-1': [pr()] }, agents: [agent()] };
const args = { repo: 'acme/payments-api', pr_number: 482 };

describe('get_findings', () => {
  it('done run -> a findings page', async () => {
    const api = new MockDevDigestApi({
      ...base,
      runs: { 'pr-482': [run({ run_id: RUN_ID, status: 'done' })] },
      reviews: { 'pr-482': [review({ run_id: RUN_ID, findings: [finding({ severity: 'CRITICAL', title: 'SQL injection' })] })] },
    });
    const c = await connect(api);
    close = c.close;
    const res = await c.client.callTool({ name: 'get_findings', arguments: { ...args, run_id: RUN_ID } });
    expect(res.isError).toBeFalsy();
    expect(textOf(res)).toContain('1. [CRITICAL] bug · src/refund.ts:10-12 · SQL injection (Security)');
  });

  it('running run -> not an error, says call again', async () => {
    const api = new MockDevDigestApi({ ...base, runs: { 'pr-482': [run({ run_id: RUN_ID })] } });
    const c = await connect(api);
    close = c.close;
    const res = await c.client.callTool({ name: 'get_findings', arguments: { ...args, run_id: RUN_ID } });
    expect(res.isError).toBeFalsy();
    expect(textOf(res)).toContain('call again');
  });

  it('no run_id -> latest reviews with severity filter and format', async () => {
    const api = new MockDevDigestApi({
      ...base,
      runs: { 'pr-482': [run({ status: 'done' })] },
      reviews: {
        'pr-482': [review({ findings: [finding({ id: 'a', severity: 'SUGGESTION', title: 'nit' }), finding({ id: 'b', title: 'bug' })] })],
      },
    });
    const c = await connect(api);
    close = c.close;
    const res = await c.client.callTool({
      name: 'get_findings',
      arguments: { ...args, severity_min: 'WARNING', response_format: 'detailed' },
    });
    const text = textOf(res);
    expect(text).toContain('bug');
    expect(text).not.toContain('nit');
    expect(text).toContain('untrusted-model-output');
  });

  it('unknown run_id -> isError', async () => {
    const api = new MockDevDigestApi({ ...base, runs: { 'pr-482': [run()] } });
    const c = await connect(api);
    close = c.close;
    const res = await c.client.callTool({
      name: 'get_findings',
      arguments: { ...args, run_id: '22222222-2222-4222-8222-222222222222' },
    });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('run_review');
  });
});
