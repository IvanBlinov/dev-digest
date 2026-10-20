import type { BlastCaller, BlastRadius, DownstreamImpact } from '@devdigest/shared';
import type { BlastCallerRow, BlastResult } from '../repo-intel/types.js';

export interface BlastCounts {
  symbols: number;
  callers: number;
  endpoints: number;
  crons: number;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Deterministic one-line summary from counts (no LLM). */
export function blastSummary(c: BlastCounts): string {
  return [
    plural(c.symbols, 'changed symbol', 'changed symbols'),
    plural(c.callers, 'caller', 'callers'),
    plural(c.endpoints, 'endpoint', 'endpoints'),
    plural(c.crons, 'cron', 'crons'),
  ].join(', ');
}

function compareCallers(a: BlastCallerRow, b: BlastCallerRow): number {
  return b.rank - a.rank || a.file.localeCompare(b.file) || a.line - b.line;
}

/**
 * Map the flat repo-intel result into the grouped `BlastRadius` view: callers grouped by the
 * changed symbol they reach (name-keyed), endpoints/crons attributed via the callers' files.
 * Never caps; limits live in the repo-intel facade.
 */
export function toBlastRadius(result: BlastResult): BlastRadius {
  const declaringFiles = new Map<string, Set<string>>();
  for (const s of result.changedSymbols) {
    const files = declaringFiles.get(s.name) ?? new Set<string>();
    files.add(s.file);
    declaringFiles.set(s.name, files);
  }

  const bySymbol = new Map<string, BlastCallerRow[]>();
  for (const row of result.callers) {
    if (declaringFiles.get(row.viaSymbol)?.has(row.file)) continue;
    bySymbol.set(row.viaSymbol, [...(bySymbol.get(row.viaSymbol) ?? []), row]);
  }

  const groups = [...bySymbol.entries()].map(([symbol, rows]) => {
    const sorted = [...rows].sort(compareCallers);
    const files = new Set(sorted.map((r) => r.file));
    const endpoints = new Set<string>();
    const crons = new Set<string>();
    for (const f of files) {
      const facts = result.factsByFile?.[f];
      facts?.endpoints.forEach((e) => endpoints.add(e));
      facts?.crons.forEach((c) => crons.add(c));
    }
    const impact: DownstreamImpact = {
      symbol,
      callers: sorted.map((r): BlastCaller => ({ name: r.symbol, file: r.file, line: r.line })),
      endpoints_affected: [...endpoints],
      crons_affected: [...crons],
    };
    return { impact, maxRank: sorted[0]?.rank ?? 0 };
  });
  groups.sort((a, b) => b.maxRank - a.maxRank || a.impact.symbol.localeCompare(b.impact.symbol));
  const downstream = groups.map((g) => g.impact);

  const counts: BlastCounts = {
    symbols: result.changedSymbols.length,
    callers: downstream.reduce((n, d) => n + d.callers.length, 0),
    endpoints: new Set(downstream.flatMap((d) => d.endpoints_affected)).size,
    crons: new Set(downstream.flatMap((d) => d.crons_affected)).size,
  };

  return {
    changed_symbols: result.changedSymbols.map((s) => ({ file: s.file, name: s.name, kind: s.kind })),
    downstream,
    summary: blastSummary(counts),
    ...(result.degraded !== undefined ? { degraded: result.degraded } : {}),
    ...(result.reason !== undefined ? { reason: result.reason } : {}),
  };
}
