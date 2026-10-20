import type { CSSProperties } from "react";

export const s = {
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: { display: "flex", alignItems: "flex-start", gap: 12, overflowX: "auto", minWidth: 0 } satisfies CSSProperties,
  num: { width: 20, color: "var(--text-muted)", fontSize: 13, flexShrink: 0 } satisfies CSSProperties,
  main: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 } satisfies CSSProperties,
  comment: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  copy: {
    background: "none",
    border: "1px solid var(--border)",
    borderRadius: 6,
    color: "var(--text-secondary)",
    cursor: "pointer",
    fontSize: 12,
    padding: "3px 8px",
    flexShrink: 0,
  } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
} as const;
