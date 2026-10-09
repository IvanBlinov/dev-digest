import { describe, it, expect } from 'vitest';
import type { Finding } from '@devdigest/shared';
import { partitionByScope, isProtectedFromScopeFilter } from '../src/index.js';

function f(over: Partial<Finding> & { title: string }): Finding {
  return {
    id: over.title,
    severity: 'WARNING',
    category: 'bug',
    file: 'a.ts',
    start_line: 1,
    end_line: 1,
    rationale: 'r',
    confidence: 0.5,
    scope: 'in',
    ...over,
  };
}

describe('isProtectedFromScopeFilter', () => {
  it('CRITICAL or security WARNING that is out of scope', () => {
    expect(isProtectedFromScopeFilter(f({ title: 'a', severity: 'CRITICAL', scope: 'out' }))).toBe(true);
    expect(isProtectedFromScopeFilter(f({ title: 'a', severity: 'WARNING', category: 'security', scope: 'out' }))).toBe(true);
    expect(isProtectedFromScopeFilter(f({ title: 'a', severity: 'WARNING', category: 'bug', scope: 'out' }))).toBe(false);
    expect(isProtectedFromScopeFilter(f({ title: 'a', severity: 'SUGGESTION', scope: 'out' }))).toBe(false);
    expect(isProtectedFromScopeFilter(f({ title: 'a', severity: 'CRITICAL', scope: 'in' }))).toBe(false);
  });
});

describe('partitionByScope', () => {
  it('disabled → everything kept', () => {
    const all = [f({ title: 'x', scope: 'out', severity: 'CRITICAL' }), f({ title: 'y' })];
    const r = partitionByScope(all, { enabled: false });
    expect(r.kept).toHaveLength(2);
    expect(r.dropped).toHaveLength(0);
  });

  it('in and null scope are kept', () => {
    const r = partitionByScope([f({ title: 'a', scope: 'in' }), f({ title: 'b', scope: null }), f({ title: 'c', scope: undefined })], { enabled: true });
    expect(r.kept).toHaveLength(3);
    expect(r.dropped).toHaveLength(0);
  });

  it('keeps every out-of-scope CRITICAL and security WARNING (still tagged out)', () => {
    const c1 = f({ title: 'crit-1', severity: 'CRITICAL', scope: 'out' });
    const c2 = f({ title: 'crit-2', severity: 'CRITICAL', scope: 'out' });
    const sec = f({ title: 'sec', severity: 'WARNING', category: 'security', scope: 'out' });
    const r = partitionByScope([c1, c2, sec], { enabled: true });
    expect(r.kept.map((x) => x.title)).toEqual(['crit-1', 'crit-2', 'sec']);
    expect(r.kept.every((x) => x.scope === 'out')).toBe(true);
    expect(r.dropped).toHaveLength(0);
  });

  it('drops out-of-scope non-security WARNING and SUGGESTION with a reason', () => {
    const w = f({ title: 'warn-bug', severity: 'WARNING', scope: 'out' });
    const s = f({ title: 'sugg', severity: 'SUGGESTION', scope: 'out' });
    const r = partitionByScope([w, s, f({ title: 'in' })], { enabled: true });
    expect(r.kept.map((x) => x.title)).toEqual(['in']);
    expect(r.dropped.map((d) => d.finding.title)).toEqual(['warn-bug', 'sugg']);
    expect(r.dropped.every((d) => d.reason === 'out of PR scope')).toBe(true);
  });
});
