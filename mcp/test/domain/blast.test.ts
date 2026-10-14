import { describe, expect, it } from 'vitest';
import { blastView } from '../../src/domain/blast';
import { blastRadius } from '../mocks';

describe('blastView', () => {
  it('passes everything through without a file filter, callers attached to their symbol', () => {
    const v = blastView(blastRadius());
    expect(v.symbols.map((s) => s.name)).toEqual(['formatMoney', 'parseMoney']);
    expect(v.symbols[0]).toMatchObject({
      file: 'src/lib/money.ts',
      callers: [
        { name: 'refund', file: 'src/a.ts', line: 12 },
        { name: 'order', file: 'src/b.ts', line: 30 },
      ],
      endpoints: ['GET /refunds'],
      crons: ['0 * * * *'],
    });
    expect(v.symbols[1]!.callers).toEqual([]);
    expect(v.summary).toBe('2 changed symbols, 2 callers, 1 endpoint, 1 cron');
    expect(v.degraded).toBe(false);
    expect(v.fileFilterMiss).toBe(false);
  });

  it('keeps only the symbols of the given file', () => {
    const v = blastView(blastRadius(), 'src/lib/money.ts');
    expect(v.symbols.map((s) => s.name)).toEqual(['formatMoney']);
    expect(v.fileFilterMiss).toBe(false);
  });

  it('flags a file with no changed symbols', () => {
    const v = blastView(blastRadius(), 'src/none.ts');
    expect(v.symbols).toEqual([]);
    expect(v.fileFilterMiss).toBe(true);
  });

  it('carries degraded and reason', () => {
    const v = blastView(blastRadius({ degraded: true, reason: 'no_data' }));
    expect(v).toMatchObject({ degraded: true, reason: 'no_data' });
  });
});
