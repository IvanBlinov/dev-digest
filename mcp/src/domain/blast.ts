import type { BlastRadius } from '@devdigest/shared';

export interface BlastCallerView {
  name: string;
  file: string;
  line: number;
}

export interface BlastSymbolView {
  name: string;
  file: string;
  kind: string;
  callers: BlastCallerView[];
  endpoints: string[];
  crons: string[];
}

export interface BlastView {
  /** Server-computed one-line counts for the whole PR. */
  summary: string;
  degraded: boolean;
  reason: string | null;
  /** True when a `file` filter was given and that file declares no changed symbol. */
  fileFilterMiss: boolean;
  symbols: BlastSymbolView[];
}

/** Join changed symbols with their downstream impact (name-keyed, as the server groups them). */
export function blastView(radius: BlastRadius, file?: string): BlastView {
  const impactBySymbol = new Map(radius.downstream.map((d) => [d.symbol, d]));
  const rankOf = (name: string): number => {
    const i = radius.downstream.findIndex((d) => d.symbol === name);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const selected = radius.changed_symbols.filter((s) => file === undefined || s.file === file);
  // Server order = impact order; symbols without callers follow, in input order.
  const ordered = [...selected].sort((a, b) => rankOf(a.name) - rankOf(b.name));
  const symbols = ordered.map<BlastSymbolView>((s) => {
    const impact = impactBySymbol.get(s.name);
    return {
      name: s.name,
      file: s.file,
      kind: s.kind,
      callers: impact ? impact.callers.map((c) => ({ name: c.name, file: c.file, line: c.line })) : [],
      endpoints: impact ? [...impact.endpoints_affected] : [],
      crons: impact ? [...impact.crons_affected] : [],
    };
  });
  return {
    summary: radius.summary,
    degraded: radius.degraded === true,
    reason: radius.reason ?? null,
    fileFilterMiss: file !== undefined && symbols.length === 0,
    symbols,
  };
}
