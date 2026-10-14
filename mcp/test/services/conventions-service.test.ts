import { describe, expect, it } from 'vitest';
import { PrResolver } from '../../src/services/pr-resolver';
import { ConventionsService } from '../../src/services/conventions-service';
import { MockDevDigestApi, conventionsState, repo } from '../mocks';

describe('ConventionsService', () => {
  it('returns a view and only reads: listRepos + getConventions', async () => {
    const api = new MockDevDigestApi({
      repos: [repo()],
      conventions: { 'repo-1': conventionsState() },
    });
    const service = new ConventionsService(api, new PrResolver(api, () => 0));
    const view = await service.get({ repo: 'acme/payments-api', limit: 30 });
    expect(view.scan).toBe('never');
    expect(api.calls.map((c) => c.method).sort()).toEqual(['getConventions', 'listRepos']);
  });
});
