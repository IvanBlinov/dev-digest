import { describe, it, expect } from 'vitest';
import { BlastRadius } from '@devdigest/shared';
import { toBlastRadius, blastSummary } from '../src/modules/blast/helpers.js';
import type { BlastResult } from '../src/modules/repo-intel/types.js';

const base: BlastResult = { changedSymbols: [], callers: [], impactedEndpoints: [] };

const sym = (file: string, name: string) => ({ file, name, kind: 'function' });
const caller = (file: string, viaSymbol: string, line: number, rank = 0) => ({
  file,
  symbol: `use_${viaSymbol}`,
  viaSymbol,
  line,
  rank,
});

describe('toBlastRadius', () => {
  it('(a) groups callers per viaSymbol and maps fields', () => {
    const r = toBlastRadius({
      ...base,
      changedSymbols: [sym('lib/a.ts', 'alpha'), sym('lib/b.ts', 'beta')],
      callers: [caller('x.ts', 'alpha', 3), caller('y.ts', 'beta', 9)],
    });
    expect(r.downstream.map((d) => d.symbol)).toEqual(['alpha', 'beta']);
    expect(r.downstream[0]!.callers).toEqual([{ name: 'use_alpha', file: 'x.ts', line: 3 }]);
    expect(r.changed_symbols).toHaveLength(2);
  });

  it('(b) endpoints and crons are deduplicated unions, kept separate', () => {
    const r = toBlastRadius({
      ...base,
      changedSymbols: [sym('lib/a.ts', 'alpha')],
      callers: [caller('x.ts', 'alpha', 1), caller('y.ts', 'alpha', 2)],
      factsByFile: {
        'x.ts': { endpoints: ['GET /a'], crons: ['0 * * * *'] },
        'y.ts': { endpoints: ['GET /a', 'POST /b'], crons: [] },
      },
    });
    expect(r.downstream[0]!.endpoints_affected.sort()).toEqual(['GET /a', 'POST /b']);
    expect(r.downstream[0]!.crons_affected).toEqual(['0 * * * *']);
  });

  it('(c) absent factsByFile gives empty endpoints/crons', () => {
    const r = toBlastRadius({
      ...base,
      changedSymbols: [sym('lib/a.ts', 'alpha')],
      callers: [caller('x.ts', 'alpha', 1)],
    });
    expect(r.downstream[0]!.endpoints_affected).toEqual([]);
    expect(r.downstream[0]!.crons_affected).toEqual([]);
  });

  it('(d) orders groups by max rank desc then name; callers by rank, file, line', () => {
    const r = toBlastRadius({
      ...base,
      changedSymbols: [sym('l/a.ts', 'zeta'), sym('l/b.ts', 'alpha'), sym('l/c.ts', 'beta')],
      callers: [
        caller('m.ts', 'alpha', 1, 1),
        caller('m.ts', 'zeta', 1, 5),
        caller('b.ts', 'beta', 7, 1),
        caller('a.ts', 'beta', 9, 1),
        caller('a.ts', 'beta', 2, 1),
        caller('top.ts', 'beta', 1, 3),
      ],
    });
    // beta max 3? zeta max 5 -> zeta, beta(3), alpha(1)
    expect(r.downstream.map((d) => d.symbol)).toEqual(['zeta', 'beta', 'alpha']);
    expect(r.downstream[1]!.callers.map((c) => `${c.file}:${c.line}`)).toEqual([
      'top.ts:1',
      'a.ts:2',
      'a.ts:9',
      'b.ts:7',
    ]);
  });

  it('(e) symbols without callers stay in changed_symbols only', () => {
    const r = toBlastRadius({ ...base, changedSymbols: [sym('l/a.ts', 'lonely')] });
    expect(r.changed_symbols).toHaveLength(1);
    expect(r.downstream).toEqual([]);
  });

  it('(f) drops callers located in the declaring file', () => {
    const r = toBlastRadius({
      ...base,
      changedSymbols: [sym('l/a.ts', 'alpha')],
      callers: [caller('l/a.ts', 'alpha', 4), caller('x.ts', 'alpha', 5)],
    });
    expect(r.downstream[0]!.callers.map((c) => c.file)).toEqual(['x.ts']);
  });

  it('(g) passes degraded/reason through and omits them when absent', () => {
    const d = toBlastRadius({ ...base, degraded: true, reason: 'no_data' });
    expect(d.degraded).toBe(true);
    expect(d.reason).toBe('no_data');
    const n = toBlastRadius(base);
    expect('degraded' in n).toBe(false);
    expect('reason' in n).toBe(false);
  });

  it('(h) summary is deterministic from counts', () => {
    expect(blastSummary({ symbols: 2, callers: 3, endpoints: 1, crons: 0 })).toBe(
      '2 changed symbols, 3 callers, 1 endpoint, 0 crons',
    );
    expect(blastSummary({ symbols: 1, callers: 1, endpoints: 2, crons: 1 })).toBe(
      '1 changed symbol, 1 caller, 2 endpoints, 1 cron',
    );
  });

  it('(i,j) shared helper with two route callers yields >=2 callers and >=1 endpoint; parses', () => {
    const r = toBlastRadius({
      ...base,
      changedSymbols: [sym('src/lib/money.ts', 'formatMoney')],
      callers: [caller('src/routes/refunds.ts', 'formatMoney', 12, 2), caller('src/routes/orders.ts', 'formatMoney', 30, 1)],
      factsByFile: {
        'src/routes/refunds.ts': { endpoints: ['GET /refunds'], crons: [] },
        'src/routes/orders.ts': { endpoints: [], crons: [] },
      },
    });
    expect(r.downstream[0]!.callers.length).toBeGreaterThanOrEqual(2);
    expect(r.downstream[0]!.endpoints_affected.length).toBeGreaterThanOrEqual(1);
    expect(() => BlastRadius.parse(r)).not.toThrow();
  });
});
