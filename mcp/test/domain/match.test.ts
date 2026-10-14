import { describe, expect, it } from 'vitest';
import {
  AgentNotFoundError,
  AmbiguousAgentError,
  PrNotImportedError,
  RepoNotFoundError,
} from '../../src/domain/errors';
import { matchAgent, matchPr, matchRepo } from '../../src/domain/match';
import { agent, pr, repo } from '../mocks';

describe('matchRepo', () => {
  const repos = [repo(), repo({ id: 'repo-2', full_name: 'acme/web' })];

  it('matches owner/name case-insensitively', () => {
    expect(matchRepo(repos, 'ACME/Payments-API').full_name).toBe('acme/payments-api');
  });

  it('throws RepoNotFoundError with at most 10 known names', () => {
    const many = Array.from({ length: 15 }, (_, i) => repo({ id: `r${i}`, full_name: `o/r${i}` }));
    const err = (() => {
      try {
        matchRepo(many, 'x/y');
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(RepoNotFoundError);
    expect((err as RepoNotFoundError).known).toHaveLength(10);
    expect((err as RepoNotFoundError).requested).toBe('x/y');
  });
});

describe('matchPr', () => {
  it('returns the PR by number', () => {
    expect(matchPr([pr(), pr({ id: 'pr-1', number: 1 })], 'acme/payments-api', 482).id).toBe('pr-482');
  });

  it('throws PrNotImportedError when missing or without an id', () => {
    expect(() => matchPr([pr({ id: null })], 'acme/payments-api', 482)).toThrow(PrNotImportedError);
    expect(() => matchPr([], 'acme/payments-api', 7)).toThrow(PrNotImportedError);
  });
});

describe('matchAgent', () => {
  const agents = [agent(), agent({ id: 'agent-2', name: 'Style' })];

  it('returns all when no query', () => {
    expect(matchAgent(agents, undefined)).toEqual({ kind: 'all' });
  });

  it('matches name case-insensitively and exact id', () => {
    expect(matchAgent(agents, 'style')).toEqual({ kind: 'one', agentId: 'agent-2' });
    expect(matchAgent(agents, 'agent-1')).toEqual({ kind: 'one', agentId: 'agent-1' });
  });

  it('throws AgentNotFoundError listing names', () => {
    try {
      matchAgent(agents, 'nope');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AgentNotFoundError);
      expect((e as AgentNotFoundError).names).toEqual(['Security', 'Style']);
    }
  });

  it('throws AmbiguousAgentError for duplicate names', () => {
    const dup = [agent(), agent({ id: 'agent-9' })];
    try {
      matchAgent(dup, 'security');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AmbiguousAgentError);
      expect((e as AmbiguousAgentError).candidates).toEqual([
        { name: 'Security', id: 'agent-1' },
        { name: 'Security', id: 'agent-9' },
      ]);
    }
  });
});
