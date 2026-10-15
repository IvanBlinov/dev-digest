import { describe, expect, it } from 'vitest';
import { ApiError, ApiTimeoutError, ApiUnreachableError } from '../../src/api/errors';
import { HttpDevDigestApi } from '../../src/api/http-client';

const config = { apiUrl: 'http://api.test:3001', timeoutMs: 5000 };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('HttpDevDigestApi', () => {
  it('GETs and parses a 200 body', async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const api = new HttpDevDigestApi(config, async (url, init) => {
      seen.push({ url: String(url), init });
      return jsonResponse([{ id: 'r1' }]);
    });
    await expect(api.listRepos()).resolves.toEqual([{ id: 'r1' }]);
    expect(seen[0]?.url).toBe('http://api.test:3001/repos');
    expect(seen[0]?.init?.method ?? 'GET').toBe('GET');
  });

  it('POSTs the review body as JSON to /pulls/<id>/review', async () => {
    let captured: { url: string; init?: RequestInit } | undefined;
    const api = new HttpDevDigestApi(config, async (url, init) => {
      captured = { url: String(url), init };
      return jsonResponse({ pr_id: 'p1', runs: [], reviews: [] });
    });
    await api.startReview('p1', { all: true });
    expect(captured?.url).toBe('http://api.test:3001/pulls/p1/review');
    expect(captured?.init?.method).toBe('POST');
    expect(JSON.parse(String(captured?.init?.body))).toEqual({ all: true });
    expect(new Headers(captured?.init?.headers).get('content-type')).toBe('application/json');
  });

  it('maps a 404 envelope to ApiError without details', async () => {
    const api = new HttpDevDigestApi(config, async () =>
      jsonResponse({ error: { code: 'not_found', message: 'PR not found', details: { secret: 1 } } }, 404),
    );
    const err = await api.listRuns('x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 404, code: 'not_found', message: 'PR not found' });
    expect(JSON.stringify(err)).not.toContain('secret');
    expect(Object.keys(err as object)).not.toContain('details');
  });

  it('maps ECONNREFUSED to ApiUnreachableError', async () => {
    const api = new HttpDevDigestApi(config, async () => {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    });
    const err = await api.listAgents().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiUnreachableError);
    expect((err as ApiUnreachableError).url).toBe('http://api.test:3001');
  });

  it('maps an abort-by-timeout to ApiTimeoutError', async () => {
    const api = new HttpDevDigestApi(config, async () => {
      throw new DOMException('timed out', 'TimeoutError');
    });
    const err = await api.listPulls('r1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiTimeoutError);
    expect((err as ApiTimeoutError).timeoutMs).toBe(5000);
  });

  it('maps a non-JSON 500 to ApiError http_500', async () => {
    const api = new HttpDevDigestApi(
      config,
      async () => new Response('<html>boom</html>', { status: 500 }),
    );
    const err = await api.getConventions('r1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 500, code: 'http_500' });
  });

  it('getBlastRadius GETs /pulls/:id/blast with the id encoded', async () => {
    const seen: string[] = [];
    const api = new HttpDevDigestApi(config, async (url) => {
      seen.push(String(url));
      return jsonResponse({ changed_symbols: [], downstream: [], summary: 's' });
    });
    await api.getBlastRadius('pr/1');
    expect(seen).toEqual(['http://api.test:3001/pulls/pr%2F1/blast']);
  });
});
