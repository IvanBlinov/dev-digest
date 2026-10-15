import type { BlastRadius } from "@devdigest/shared";

export interface BlastCounts {
  symbols: number;
  callers: number;
  endpoints: number;
  crons: number;
}

/** Summary-row numbers: endpoints/crons are unique across all symbols. */
export function blastCounts(radius: BlastRadius): BlastCounts {
  return {
    symbols: radius.changed_symbols.length,
    callers: radius.downstream.reduce((n, d) => n + d.callers.length, 0),
    endpoints: new Set(radius.downstream.flatMap((d) => d.endpoints_affected)).size,
    crons: new Set(radius.downstream.flatMap((d) => d.crons_affected)).size,
  };
}
