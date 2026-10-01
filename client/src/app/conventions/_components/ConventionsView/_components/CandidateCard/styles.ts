import type { CSSProperties } from "react";

export const s = {
  card: (accepted: boolean): CSSProperties => ({
    display: "flex",
    gap: 20,
    padding: "16px 18px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    borderLeft: `3px solid ${accepted ? "var(--ok)" : "var(--border)"}`,
    background: "var(--bg-elevated)",
  }),
  main: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  meta: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  rule: {
    margin: 0,
    fontSize: 14.5,
    fontStyle: "italic",
    lineHeight: 1.5,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  confidence: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  confidenceLabel: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  bar: { width: 160 } satisfies CSSProperties,
  pct: { fontSize: 12.5, fontWeight: 600 } satisfies CSSProperties,
  actions: { display: "flex", flexDirection: "column", gap: 8, width: 116, flexShrink: 0 } satisfies CSSProperties,
  acceptedBtn: { background: "var(--ok)", borderColor: "var(--ok)" } satisfies CSSProperties,
} as const;
