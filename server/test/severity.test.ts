/**
 * Findings-by-severity rule (`modules/reviews/severity.ts`) — the single place
 * that decides which findings a PR "has": newest review per agent, dismissed
 * excluded. Pure, so it gets unit coverage independent of the routes.
 */
import { describe, it, expect } from 'vitest';
import {
  pickLatestPerAgent,
  activeFindings,
  rollupSeverities,
  countActiveFindings,
  groupBy,
} from '../src/modules/reviews/severity.js';

const d = (iso: string) => new Date(iso);

describe('pickLatestPerAgent', () => {
  it('keeps the newest review per agent regardless of input order', () => {
    const picked = pickLatestPerAgent([
      { id: 'a-old', agentId: 'A', createdAt: d('2026-06-01T00:00:00Z') },
      { id: 'b-1', agentId: 'B', createdAt: d('2026-06-02T00:00:00Z') },
      { id: 'a-new', agentId: 'A', createdAt: d('2026-06-03T00:00:00Z') },
    ]);
    expect(picked.map((r) => r.id).sort()).toEqual(['a-new', 'b-1']);
  });
  it('treats reviews of a deleted agent (agentId null) as their own bucket', () => {
    const picked = pickLatestPerAgent([
      { id: 'x', agentId: null, createdAt: d('2026-06-01T00:00:00Z') },
      { id: 'y', agentId: null, createdAt: d('2026-06-02T00:00:00Z') },
      { id: 'z', agentId: 'A', createdAt: d('2026-06-01T00:00:00Z') },
    ]);
    expect(picked.map((r) => r.id).sort()).toEqual(['y', 'z']);
  });
});

describe('activeFindings + rollupSeverities', () => {
  it('drops dismissed findings and tallies the rest', () => {
    const rows = activeFindings([
      { reviewId: 'r', severity: 'CRITICAL', dismissedAt: null },
      { reviewId: 'r', severity: 'CRITICAL', dismissedAt: d('2026-06-01T00:00:00Z') },
      { reviewId: 'r', severity: 'WARNING', dismissedAt: null },
      { reviewId: 'r', severity: 'SUGGESTION', dismissedAt: null },
      { reviewId: 'r', severity: 'INFO', dismissedAt: null },
    ]);
    expect(rollupSeverities(rows)).toEqual({ critical: 1, warning: 1, suggestion: 1 });
  });
});

describe('countActiveFindings (the PR rule)', () => {
  const reviews = [
    { id: 'a-old', agentId: 'A', createdAt: d('2026-06-01T00:00:00Z') },
    { id: 'a-new', agentId: 'A', createdAt: d('2026-06-03T00:00:00Z') },
    { id: 'b-1', agentId: 'B', createdAt: d('2026-06-02T00:00:00Z') },
  ];
  const findings = [
    { reviewId: 'a-old', severity: 'CRITICAL', dismissedAt: null }, // superseded run — ignored
    { reviewId: 'a-new', severity: 'CRITICAL', dismissedAt: null },
    { reviewId: 'a-new', severity: 'WARNING', dismissedAt: d('2026-06-04T00:00:00Z') }, // dismissed
    { reviewId: 'b-1', severity: 'SUGGESTION', dismissedAt: null },
    { reviewId: 'b-1', severity: 'SUGGESTION', dismissedAt: null },
  ];
  it('counts only the newest review per agent and skips dismissed', () => {
    expect(countActiveFindings(reviews, findings)).toEqual({ critical: 1, warning: 0, suggestion: 2 });
  });
  it('is null for a never-reviewed PR and zeros for a reviewed-clean PR', () => {
    expect(countActiveFindings([], [])).toBeNull();
    expect(countActiveFindings([reviews[2]!], [])).toEqual({ critical: 0, warning: 0, suggestion: 0 });
  });
});

describe('groupBy', () => {
  it('groups without mutating input', () => {
    const rows = [{ k: 'a', v: 1 }, { k: 'b', v: 2 }, { k: 'a', v: 3 }];
    const g = groupBy(rows, (r) => r.k);
    expect(g.get('a')?.map((r) => r.v)).toEqual([1, 3]);
    expect(rows).toHaveLength(3);
  });
});
