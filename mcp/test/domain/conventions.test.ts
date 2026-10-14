import { describe, expect, it } from 'vitest';
import { conventionsView } from '../../src/domain/conventions';
import { conventionsState } from '../mocks';

const cand = (id: string, status: 'accepted' | 'pending', confidence: number) => ({
  id,
  category: 'naming' as const,
  rule: `rule ${id}`,
  evidence_path: 'src/a.ts',
  evidence_start_line: 1,
  evidence_end_line: 2,
  evidence_snippet: 'x',
  confidence,
  status,
  accepted: status === 'accepted',
  edited: false,
  created_at: '2026-10-13T00:00:00.000Z',
});

const scan = (status: 'running' | 'done' | 'failed') => ({
  id: 's',
  repo_id: 'repo-1',
  status,
  sample_files: [],
  provider: 'openai',
  model: 'm',
  candidates_found: 0,
  error: null,
  started_at: '2026-10-13T00:00:00.000Z',
  finished_at: null,
});

describe('conventionsView', () => {
  it('reports scan state and indexed flag', () => {
    expect(conventionsView(conventionsState(), 30).scan).toBe('never');
    expect(conventionsView(conventionsState({ scan: scan('running') }), 30).scan).toBe('running');
    expect(conventionsView(conventionsState({ scan: scan('failed') }), 30).scan).toBe('failed');
    expect(conventionsView(conventionsState({ indexed: false }), 30).indexed).toBe(false);
  });

  it('puts accepted first, cuts at limit and reports remaining', () => {
    const state = conventionsState({
      scan: scan('done'),
      candidates: [cand('p1', 'pending', 0.9), cand('a1', 'accepted', 0.2), cand('p2', 'pending', 0.5)],
    });
    const v = conventionsView(state, 2);
    expect(v.scan).toBe('done');
    expect(v.items.map((i) => i.id)).toEqual(['a1', 'p1']);
    expect(v.remaining).toBe(1);
    expect(v.total).toBe(3);
  });
});
