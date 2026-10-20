import type { CSSProperties } from "react";

export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-secondary, var(--bg-primary))",
    scrollMarginTop: 72,
  } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", gap: 10, padding: "12px 16px" } satisfies CSSProperties,
  title: { fontSize: 15, fontWeight: 650, flex: 1, minWidth: 0, margin: 0 } satisfies CSSProperties,
  chip: {
    fontSize: 11,
    padding: "2px 8px",
    borderRadius: 999,
    border: "1px solid var(--border)",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  toggle: {
    background: "none",
    border: "1px solid var(--border)",
    borderRadius: 6,
    color: "var(--text-secondary)",
    cursor: "pointer",
    width: 28,
    height: 28,
    lineHeight: 1,
  } satisfies CSSProperties,
  unavailable: { padding: "0 16px 8px", fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  body: { padding: "0 16px 16px" } satisfies CSSProperties,
} as const;
