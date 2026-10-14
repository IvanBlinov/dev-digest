import { describe, expect, it } from 'vitest';
import { classifyRun, findingsPage, latestReviewPerAgent } from '../../src/domain/findings';
import { finding, review, run } from '../mocks';

const NOW = Date.parse('2026-10-13T10:01:00.000Z');

describe('classifyRun', () => {
  it('running -> age in seconds', () => {
    expect(classifyRun(run(), [], NOW)).toEqual({ status: 'running', ageSec: 60 });
  });
  it('done with a review for the run -> done', () => {
    const r = review({ run_id: 'run-1' });
    expect(classifyRun(run({ status: 'done' }), [r], NOW)).toEqual({ status: 'done', review: r });
  });
  it('done without a review -> finishing', () => {
    expect(classifyRun(run({ status: 'done' }), [review({ run_id: 'other' })], NOW)).toEqual({
      status: 'finishing',
    });
  });
  it('failed and cancelled carry the error', () => {
    expect(classifyRun(run({ status: 'failed', error: 'boom' }), [], NOW)).toEqual({
      status: 'failed',
      error: 'boom',
    });
    expect(classifyRun(run({ status: 'cancelled', error: null }), [], NOW)).toEqual({
      status: 'cancelled',
      error: null,
    });
  });
});

describe('latestReviewPerAgent', () => {
  it('keeps the newest review per agent and ignores summaries', () => {
    const old = review({ id: 'a', created_at: '2026-10-13T09:00:00.000Z' });
    const fresh = review({ id: 'b', created_at: '2026-10-13T10:00:00.000Z' });
    const other = review({ id: 'c', agent_id: 'agent-2' });
    const summary = review({ id: 'd', kind: 'summary', created_at: '2026-10-14T00:00:00.000Z' });
    expect(latestReviewPerAgent([old, fresh, other, summary]).map((r) => r.id).sort()).toEqual(['b', 'c']);
  });
});

describe('findingsPage', () => {
  const rev = review({
    findings: [
      finding({ id: 's', severity: 'SUGGESTION', confidence: 0.9 }),
      finding({ id: 'w-lo', severity: 'WARNING', confidence: 0.3 }),
      finding({ id: 'c', severity: 'CRITICAL', confidence: 0.5 }),
      finding({ id: 'w-hi', severity: 'WARNING', confidence: 0.9 }),
      finding({ id: 'dis', severity: 'CRITICAL', dismissed_at: '2026-10-13T10:00:00.000Z' }),
    ],
  });
  const base = { severityMin: 'SUGGESTION' as const, limit: 20, offset: 0 };

  it('sorts by severity then confidence, excludes dismissed, reports counts', () => {
    const p = findingsPage([rev], base);
    expect(p.items.map((i) => i.id)).toEqual(['c', 'w-hi', 'w-lo', 's']);
    expect(p.total).toBe(4);
    expect(p.dismissedCount).toBe(1);
    expect(p.counts).toEqual({ critical: 1, warning: 2, suggestion: 1 });
    expect(p.items[0]?.agentName).toBe('Security');
    expect(p.nextOffset).toBeNull();
  });

  it('filters by severityMin', () => {
    const p = findingsPage([rev], { ...base, severityMin: 'WARNING' });
    expect(p.items.map((i) => i.id)).toEqual(['c', 'w-hi', 'w-lo']);
    expect(p.total).toBe(3);
  });

  it('paginates with nextOffset', () => {
    const p = findingsPage([rev], { ...base, limit: 2 });
    expect(p.items).toHaveLength(2);
    expect(p.nextOffset).toBe(2);
    const last = findingsPage([rev], { ...base, limit: 2, offset: 2 });
    expect(last.items.map((i) => i.id)).toEqual(['w-lo', 's']);
    expect(last.nextOffset).toBeNull();
  });
});
