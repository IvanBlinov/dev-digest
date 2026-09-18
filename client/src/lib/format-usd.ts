/**
 * USD formatting for run / PR cost (L01). Small numbers dominate (cents and
 * fractions of a cent per review), so sub-dollar values keep 4 decimals and
 * dollar-plus values keep 2. `null`/`undefined` means "unknown" — rendered as
 * an em dash, never as $0.00, so an unpriced model is not mistaken for free.
 */
export function formatUsd(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v < 1 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`;
}
