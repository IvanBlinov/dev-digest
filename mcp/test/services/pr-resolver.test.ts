import { describe, expect, it } from 'vitest';
import { ApiUnreachableError } from '../../src/api/errors';
import { PrNotImportedError, RepoNotFoundError } from '../../src/domain/errors';
import { PrResolver, PR_CACHE_TTL_MS } from '../../src/services/pr-resolver';
import { MockDevDigestApi, pr, repo } from '../mocks';

function setup(extra: Partial<ConstructorParameters<typeof MockDevDigestApi>[0]> = {}) {
  const api = new MockDevDigestApi({
    repos: [repo()],
    pulls: { 'repo-1': [pr()] },
    ...extra,
  });
  let now = 1_000_000;
  const resolver = new PrResolver(api, () => now);
  return { api, resolver, advance: (ms: number) => (now += ms) };
}

describe('PrResolver', () => {
  it('resolves owner/name + number to ids', async () => {
    const { resolver } = setup();
    await expect(resolver.resolve('Acme/Payments-API', 482)).resolves.toEqual({
      repo: { id: 'repo-1', fullName: 'acme/payments-api' },
      pr: { id: 'pr-482', number: 482, title: 'Add refund endpoint' },
    });
  });

  it('serves the second call from cache within the TTL', async () => {
    const { api, resolver } = setup();
    await resolver.resolve('acme/payments-api', 482);
    await resolver.resolve('acme/payments-api', 482);
    expect(api.callsTo('listRepos')).toHaveLength(1);
    expect(api.callsTo('listPulls')).toHaveLength(1);
  });

  it('refetches after the TTL', async () => {
    const { api, resolver, advance } = setup();
    await resolver.resolve('acme/payments-api', 482);
    advance(PR_CACHE_TTL_MS + 1);
    await resolver.resolve('acme/payments-api', 482);
    expect(api.callsTo('listRepos')).toHaveLength(2);
    expect(api.callsTo('listPulls')).toHaveLength(2);
  });

  it('refetches once on a repo miss from cache, then throws', async () => {
    const { api, resolver } = setup();
    await resolver.resolve('acme/payments-api', 482);
    await expect(resolver.resolve('acme/other', 1)).rejects.toBeInstanceOf(RepoNotFoundError);
    expect(api.callsTo('listRepos')).toHaveLength(2);
  });

  it('does not double-fetch on a miss against a fresh list', async () => {
    const { api, resolver } = setup();
    await expect(resolver.resolve('acme/other', 1)).rejects.toBeInstanceOf(RepoNotFoundError);
    expect(api.callsTo('listRepos')).toHaveLength(1);
  });

  it('throws PrNotImportedError for an unknown number', async () => {
    const { resolver } = setup();
    await expect(resolver.resolve('acme/payments-api', 999)).rejects.toBeInstanceOf(PrNotImportedError);
  });

  it('propagates API errors unchanged', async () => {
    const { api, resolver } = setup();
    const err = new ApiUnreachableError('http://x');
    api.failWith('listRepos', err);
    await expect(resolver.resolve('acme/payments-api', 482)).rejects.toBe(err);
  });
});
