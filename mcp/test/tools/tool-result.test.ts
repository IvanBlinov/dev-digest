import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, ApiTimeoutError, ApiUnreachableError } from '../../src/api/errors';
import {
  AgentNotFoundError,
  AmbiguousAgentError,
  NoEnabledAgentsError,
  PrNotImportedError,
  RepoNotFoundError,
  RunNotFoundError,
} from '../../src/domain/errors';
import { ok, toToolError } from '../../src/tools/tool-result';

const textOf = (r: ReturnType<typeof toToolError>) => (r.content[0] as { text: string }).text;

describe('ok', () => {
  it('wraps text', () => {
    expect(ok('hi')).toEqual({ content: [{ type: 'text', text: 'hi' }] });
  });
});

describe('toToolError', () => {
  beforeEach(() => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  const cases: [string, unknown, RegExp[]][] = [
    ['RepoNotFound', new RepoNotFoundError('x/y', ['a/b', 'c/d']), [/Repo x\/y not found in DevDigest/, /Known: a\/b, c\/d/, /Add it in the DevDigest UI/]],
    ['PrNotImported', new PrNotImportedError('a/b', 7), [/PR #7 not found in a\/b/, /import\/sync it in the UI/]],
    ['AgentNotFound', new AgentNotFoundError('zz', ['Security', 'Style']), [/Agent "zz" not found/, /Security, Style/]],
    ['Ambiguous', new AmbiguousAgentError([{ name: 'Sec', id: 'i1' }, { name: 'Sec', id: 'i2' }]), [/Sec \(i1\), Sec \(i2\)/, /agent id/]],
    ['RunNotFound', new RunNotFoundError('r1'), [/use the run_id returned by run_review/]],
    ['NoEnabledAgents', new NoEnabledAgentsError(), [/enable an agent in the UI/]],
    ['Unreachable', new ApiUnreachableError('http://h:1'), [/unreachable at http:\/\/h:1/, /\.\/scripts\/dev\.sh/, /DEVDIGEST_API_URL/]],
    ['Timeout', new ApiTimeoutError(15000), [/did not answer within 15s/, /retry shortly/]],
    ['429', new ApiError(429, 'rate_limited', 'slow'), [/rate limit hit \(run_review: 10\/min\)/, /Wait ~60s/]],
    ['404', new ApiError(404, 'not_found', 'PR not found'), [/PR not found/]],
    ['5xx', new ApiError(500, 'internal_error', 'Internal error'), [/DevDigest API error \(internal_error\): Internal error/]],
    ['unknown', new Error('boom secret stack'), [/unexpected error/i]],
  ];

  it.each(cases)('%s -> isError with actionable text, no stack', (_n, err, patterns) => {
    const r = toToolError(err);
    expect(r.isError).toBe(true);
    const text = textOf(r);
    for (const p of patterns) expect(text).toMatch(p);
    expect(text).not.toMatch(/\n\s+at /);
    expect(text).not.toContain('details');
  });

  it('does not leak the message of an unknown error', () => {
    expect(textOf(toToolError(new Error('boom secret stack')))).not.toContain('secret');
  });
});
