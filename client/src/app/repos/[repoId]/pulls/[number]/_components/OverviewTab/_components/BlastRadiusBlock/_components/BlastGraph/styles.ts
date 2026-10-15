import type { CSSProperties } from "react";
import type { GraphNodeKind } from "./helpers";

/** Node colours per kind: blue for the changed symbol and endpoints, neutral callers, amber crons. */
export const NODE_TONE: Record<GraphNodeKind, { fill: string; stroke: string }> = {
  symbol: { fill: "var(--accent-bg)", stroke: "var(--accent)" },
  caller: { fill: "var(--bg-elevated)", stroke: "var(--border-strong)" },
  endpoint: { fill: "var(--bg-elevated)", stroke: "var(--accent)" },
  cron: { fill: "var(--warn-bg)", stroke: "var(--warn)" },
};

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  svg: { width: "100%", height: "auto", display: "block", overflow: "visible" } satisfies CSSProperties,
  edge: { fill: "none", stroke: "var(--border-strong)", strokeWidth: 1.25 } satisfies CSSProperties,
  nodeText: {
    fill: "var(--text-primary)",
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
    fontSize: 13,
  } satisfies CSSProperties,
  legend: { display: "flex", flexWrap: "wrap", gap: 16, margin: 0, padding: 0, listStyle: "none" } satisfies CSSProperties,
  legendItem: { display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  dot: { width: 9, height: 9, borderRadius: "50%", display: "inline-block" } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
