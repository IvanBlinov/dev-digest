import { describe, expect, it } from 'vitest';
import { RepoNotFoundError } from '../../src/domain/errors';
import { BlastService } from '../../src/services/blast-service';
import { PrResolver } from '../../src/services/pr-resolver';
import { MockDevDigestApi, blastRadius, pr, repo } from '../mocks';

function setup() {
  const api = new MockDevDigestApi({
    repos: [repo()],
    pulls: { 'repo-1': [pr()] },
    blast: { 'pr-482': blastRadius() },
  });
  return { api, service: new BlastService(api, new PrResolver(api, () => 0)) };
}

describe('BlastService', () => {
  it('resolves the PR and reads the blast radius exactly once', async () => {
    const { api, service } = setup();
    const res = await service.get({ repo: 'acme/payments-api', prNumber: 482 });
    expect(res.pr.pr.id).toBe('pr-482');
    expect(res.view.symbols).toHaveLength(2);
    expect(api.callsTo('getBlastRadius')).toEqual([['pr-482']]);
  });

  it('applies the file filter', async () => {
    const { service } = setup();
    const res = await service.get({ repo: 'acme/payments-api', prNumber: 482, file: 'src/none.ts' });
    expect(res.view.fileFilterMiss).toBe(true);
  });

  it('rejects an unknown repo', async () => {
    const { service } = setup();
    await expect(service.get({ repo: 'x/y', prNumber: 1 })).rejects.toBeInstanceOf(RepoNotFoundError);
  });
});
