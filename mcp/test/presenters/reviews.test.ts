import { describe, expect, it } from 'vitest';
import { presentRunStatus, presentStarted } from '../../src/presenters/reviews';

describe('presentStarted', () => {
  it('reports running status, ids and the next step', () => {
    const t = presentStarted({
      label: 'acme/payments-api#482',
      runs: [{ runId: 'run-1', agentName: 'Security' }],
    });
    expect(t).toContain('status: running');
    expect(t).toContain('run-1');
    expect(t).toContain('Security');
    expect(t).toContain('Next: call get_findings');
    expect(t).toContain('~60s');
  });
});

describe('presentRunStatus', () => {
  const ctx = { label: 'a/b#1', runId: 'run-1', agentName: 'Security' };
  it('running', () => {
    expect(presentRunStatus({ ...ctx, outcome: { status: 'running', ageSec: 30 } })).toContain('call again in ~30s');
  });
  it('finishing', () => {
    expect(presentRunStatus({ ...ctx, outcome: { status: 'finishing' } })).toContain('finishing');
  });
  it('failed and cancelled show the error', () => {
    expect(presentRunStatus({ ...ctx, outcome: { status: 'failed', error: 'LLM boom' } })).toContain('LLM boom');
    expect(presentRunStatus({ ...ctx, outcome: { status: 'cancelled', error: null } })).toContain('cancelled');
  });
});
