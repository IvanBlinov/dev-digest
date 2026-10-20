import type { CSSProperties } from "react";

export const s = {
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  row: { display: "flex", alignItems: "flex-start", gap: 12, minWidth: 0 } satisfies CSSProperties,
  main: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 } satisfies CSSProperties,
  fact: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  reason: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  open: { fontSize: 12.5, textDecoration: "underline", flexShrink: 0 } satisfies CSSProperties,
} as const;
