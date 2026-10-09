import { describe, it, expect } from 'vitest';
import type { Finding } from '@devdigest/shared';
import {
  pickSignal,
  signalDecisionLine,
  waitingLine,
  type ScopeComputation,
} from '../src/modules/reviews/scope-signal.js';

const f = (title: string, over: Partial<Finding> = {}): Finding => ({
  id: title,
  severity: 'CRITICAL',
  category: 'security',
  title,
  file: 'a.ts',
  start_line: 1,
  end_line: 1,
  rationale: 'SECRET RATIONALE BODY',
  confidence: 0.8,
  scope: 'out',
  ...over,
});

const comps = (): ScopeComputation[] => [
  { order: 2, agentName: 'C', candidate: f('crit-at-2') },
  { order: 0, agentName: 'A', candidate: f('crit-at-0') },
  { order: 1, agentName: 'B', candidate: f('warn-sec-at-1', { severity: 'WARNING', confidence: 0.99 }) },
  { order: 3, agentName: 'D', candidate: null },
];

describe('pickSignal', () => {
  it('picks the order-0 CRITICAL regardless of array order', () => {
    const base = comps();
    for (const arr of [base, [...base].reverse(), [base[1]!, base[3]!, base[0]!, base[2]!]]) {
      const r = pickSignal(arr);
      expect(r.winner?.finding.title).toBe('crit-at-0');
      expect(r.winner?.order).toBe(0);
      expect(r.losers.map((l) => l.finding.title).sort()).toEqual(['crit-at-2', 'warn-sec-at-1']);
    }
  });

  it('no candidates → no winner', () => {
    const r = pickSignal([{ order: 0, agentName: 'A', candidate: null }]);
    expect(r.winner).toBeNull();
    expect(r.losers).toEqual([]);
  });
});

describe('log lines', () => {
  it('decision line names the kept signal and the dropped count — and nothing from the rationale', () => {
    const r = pickSignal(comps());
    const line = signalDecisionLine(r.winner, r.losers.length);
    expect(line).toBe(
      'Out-of-scope signal: kept "crit-at-0" (CRITICAL security, conf 0.8) from agent "A"; dropped 2 other candidate(s)',
    );
    expect(line).not.toContain('SECRET');
    expect(signalDecisionLine(null, 0)).toBe('Out-of-scope signal: none');
  });

  it('waiting line counts the other agents', () => {
    expect(waitingLine(2)).toContain('2 other agent(s)');
  });
});
