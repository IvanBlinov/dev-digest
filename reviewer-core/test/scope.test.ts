import { describe, it, expect } from 'vitest';
import type { Finding, Review } from '@devdigest/shared';
import {
  partitionByScope,
  pickScopeSignal,
  withScopeSignal,
  compareScopeSignal,
  isScopeSignalEligible,
} from '../src/index.js';

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

describe('isScopeSignalEligible', () => {
  it('CRITICAL or security WARNING that is out of scope', () => {
    expect(isScopeSignalEligible(f({ title: 'a', severity: 'CRITICAL', scope: 'out' }))).toBe(true);
    expect(isScopeSignalEligible(f({ title: 'a', severity: 'WARNING', category: 'security', scope: 'out' }))).toBe(true);
    expect(isScopeSignalEligible(f({ title: 'a', severity: 'WARNING', category: 'bug', scope: 'out' }))).toBe(false);
    expect(isScopeSignalEligible(f({ title: 'a', severity: 'SUGGESTION', scope: 'out' }))).toBe(false);
    expect(isScopeSignalEligible(f({ title: 'a', severity: 'CRITICAL', scope: 'in' }))).toBe(false);
  });
});

describe('partitionByScope', () => {
  it('disabled → everything kept, no candidate', () => {
    const all = [f({ title: 'x', scope: 'out', severity: 'CRITICAL' }), f({ title: 'y' })];
    const r = partitionByScope(all, { enabled: false });
    expect(r.kept).toHaveLength(2);
    expect(r.candidate).toBeNull();
    expect(r.dropped).toHaveLength(0);
  });

  it('in and null scope are kept', () => {
    const r = partitionByScope([f({ title: 'a', scope: 'in' }), f({ title: 'b', scope: null }), f({ title: 'c', scope: undefined })], { enabled: true });
    expect(r.kept).toHaveLength(3);
    expect(r.candidate).toBeNull();
  });

  it('best eligible out finding is the candidate; every other out finding is dropped with a reason', () => {
    const a = f({ title: 'crit-0.9', severity: 'CRITICAL', confidence: 0.9, scope: 'out' });
    const b = f({ title: 'crit-0.6', severity: 'CRITICAL', confidence: 0.6, scope: 'out' });
    const c = f({ title: 'warn-bug', severity: 'WARNING', scope: 'out' });
    const r = partitionByScope([c, b, a, f({ title: 'in' })], { enabled: true });
    expect(r.candidate?.title).toBe('crit-0.9');
    expect(r.kept.map((x) => x.title)).toEqual(['in']);
    expect(r.dropped.map((d) => d.finding.title).sort()).toEqual(['crit-0.6', 'warn-bug']);
    expect(r.dropped.find((d) => d.finding.title === 'crit-0.6')!.reason).toBe('out of PR scope (not the top signal)');
    expect(r.dropped.find((d) => d.finding.title === 'warn-bug')!.reason).toBe('out of PR scope');
  });

  it('a security WARNING is a candidate when no CRITICAL exists', () => {
    const s = f({ title: 'sec', severity: 'WARNING', category: 'security', scope: 'out' });
    expect(partitionByScope([s], { enabled: true }).candidate?.title).toBe('sec');
  });

  it('only out SUGGESTIONs → no candidate', () => {
    const r = partitionByScope([f({ title: 's', severity: 'SUGGESTION', scope: 'out' })], { enabled: true });
    expect(r.candidate).toBeNull();
    expect(r.kept).toHaveLength(0);
    expect(r.dropped).toHaveLength(1);
  });
});

describe('pickScopeSignal / compareScopeSignal', () => {
  const c8at2 = { order: 2, finding: f({ title: 'c8-2', severity: 'CRITICAL', confidence: 0.8, scope: 'out' }) };
  const c8at0 = { order: 0, finding: f({ title: 'c8-0', severity: 'CRITICAL', confidence: 0.8, scope: 'out' }) };
  const w = { order: 1, finding: f({ title: 'w', severity: 'WARNING', category: 'security', confidence: 0.99, scope: 'out' }) };

  it('severity, then confidence, then order; independent of input order', () => {
    for (const input of [[c8at2, c8at0, w], [w, c8at0, c8at2], [c8at2, w, c8at0]]) {
      const r = pickScopeSignal(input);
      expect(r.winner?.finding.title).toBe('c8-0');
      expect(r.losers).toHaveLength(2);
    }
  });

  it('higher confidence beats earlier order', () => {
    const hi = { order: 5, finding: f({ title: 'hi', severity: 'CRITICAL', confidence: 0.95, scope: 'out' }) };
    expect(pickScopeSignal([c8at0, hi]).winner?.finding.title).toBe('hi');
  });

  it('ties fall through to file, start_line, title', () => {
    const x = { finding: f({ title: 'b', severity: 'CRITICAL', file: 'a.ts', start_line: 5, scope: 'out' }) };
    const y = { finding: f({ title: 'a', severity: 'CRITICAL', file: 'a.ts', start_line: 5, scope: 'out' }) };
    expect(compareScopeSignal(x, y)).toBeGreaterThan(0);
    expect(pickScopeSignal([x, y]).winner?.finding.title).toBe('a');
  });

  it('no candidates → no winner', () => {
    expect(pickScopeSignal([])).toEqual({ winner: null, losers: [] });
  });
});

describe('withScopeSignal', () => {
  const review: Review = {
    verdict: 'approve',
    summary: 's',
    score: 100,
    findings: [],
  } as Review;

  it('appends the signal and recomputes the score without mutating', () => {
    const sig = f({ title: 'sig', severity: 'CRITICAL', scope: 'out' });
    const out = withScopeSignal(review, sig);
    expect(out.findings).toHaveLength(1);
    expect(out.score).toBe(65);
    expect(review.findings).toHaveLength(0);
    expect(review.score).toBe(100);
  });

  it('a null signal leaves the review unchanged', () => {
    expect(withScopeSignal(review, null)).toBe(review);
  });
});
