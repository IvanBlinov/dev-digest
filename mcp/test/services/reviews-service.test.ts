import { describe, expect, it } from 'vitest';
import {
  AgentNotFoundError,
  NoEnabledAgentsError,
  RunNotFoundError,
} from '../../src/domain/errors';
import { PrResolver } from '../../src/services/pr-resolver';
import { ReviewsService } from '../../src/services/reviews-service';
import { MockDevDigestApi, agent, finding, pr, repo, review, run } from '../mocks';

const NOW = Date.parse('2026-10-13T10:01:00.000Z');

function setup(fixtures: ConstructorParameters<typeof MockDevDigestApi>[0] = {}) {
  const api = new MockDevDigestApi({
    repos: [repo()],
    pulls: { 'repo-1': [pr()] },
    agents: [agent(), agent({ id: 'agent-2', name: 'Style' })],
    ...fixtures,
  });
  const clock = () => NOW;
  return { api, service: new ReviewsService(api, new PrResolver(api, clock), clock) };
}

const target = { repo: 'acme/payments-api', prNumber: 482 };
const page = { severityMin: 'SUGGESTION' as const, limit: 20, offset: 0 };

describe('ReviewsService.start', () => {
  it('POSTs {all:true} when no agent is given and never polls', async () => {
    const { api, service } = setup();
    const res = await service.start(target);
    expect(api.callsTo('startReview')).toEqual([['pr-482', { all: true }]]);
    expect(res.pr.pr.number).toBe(482);
    expect(res.runs).toEqual([
      { runId: 'run-1', agentName: 'Security' },
      { runId: 'run-2', agentName: 'Style' },
    ]);
    expect(api.callsTo('listRuns')).toHaveLength(0);
    expect(api.callsTo('listReviews')).toHaveLength(0);
  });

  it('POSTs {agentId} when the agent matches', async () => {
    const { api, service } = setup();
    await service.start({ ...target, agent: 'style' });
    expect(api.callsTo('startReview')).toEqual([['pr-482', { agentId: 'agent-2' }]]);
  });

  it('throws AgentNotFoundError for an unknown agent before starting anything', async () => {
    const { api, service } = setup();
    await expect(service.start({ ...target, agent: 'nope' })).rejects.toBeInstanceOf(AgentNotFoundError);
    expect(api.callsTo('startReview')).toHaveLength(0);
  });

  it('throws NoEnabledAgentsError when no run was created', async () => {
    const { service } = setup({ agents: [agent({ enabled: false })] });
    await expect(service.start(target)).rejects.toBeInstanceOf(NoEnabledAgentsError);
  });
});

describe('ReviewsService.findings', () => {
  it('running run -> outcome running, listReviews not called', async () => {
    const { api, service } = setup({ runs: { 'pr-482': [run()] } });
    const res = await service.findings({ ...target, runId: 'run-1', ...page });
    expect(res).toMatchObject({ kind: 'run', outcome: { status: 'running', ageSec: 60 }, reviews: [], page: null });
    expect(api.callsTo('listReviews')).toHaveLength(0);
  });

  it('done run -> outcome done with a page', async () => {
    const { service } = setup({
      runs: { 'pr-482': [run({ status: 'done' })] },
      reviews: { 'pr-482': [review({ findings: [finding()] })] },
    });
    const res = await service.findings({ ...target, runId: 'run-1', ...page });
    expect(res.kind).toBe('run');
    if (res.kind !== 'run') return;
    expect(res.outcome.status).toBe('done');
    expect(res.reviews).toEqual([
      { agentName: 'Security', verdict: 'comment', score: 80, summary: 'Looks mostly fine' },
    ]);
    expect(res.page?.total).toBe(1);
  });

  it('unknown run -> RunNotFoundError', async () => {
    const { service } = setup({ runs: { 'pr-482': [run()] } });
    await expect(service.findings({ ...target, runId: 'zzz', ...page })).rejects.toBeInstanceOf(
      RunNotFoundError,
    );
  });

  it('no runId -> latest reviews, running runs and a page', async () => {
    const { service } = setup({
      runs: { 'pr-482': [run({ run_id: 'run-9', agent_name: 'Style' }), run({ status: 'done' })] },
      reviews: { 'pr-482': [review({ findings: [finding()] })] },
    });
    const res = await service.findings({ ...target, ...page });
    expect(res.kind).toBe('pr');
    if (res.kind !== 'pr') return;
    expect(res.reviews).toEqual([
      { agentName: 'Security', verdict: 'comment', score: 80, summary: 'Looks mostly fine' },
    ]);
    expect(res.running).toEqual([{ runId: 'run-9', agentName: 'Style', ageSec: 60 }]);
    expect(res.page?.total).toBe(1);
  });

  it('nothing at all -> null page and no running', async () => {
    const { service } = setup();
    const res = await service.findings({ ...target, ...page });
    expect(res).toMatchObject({ kind: 'pr', page: null, running: [], reviews: [] });
  });
});
