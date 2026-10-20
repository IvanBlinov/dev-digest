import type { CSSProperties } from "react";

export const s = {
  root: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  top: { display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" } satisfies CSSProperties,
  h1: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", margin: 0, flex: 1, minWidth: 0 } satisfies CSSProperties,
  meta: { fontSize: 12.5, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
  banner: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "8px 12px",
    fontSize: 13,
    color: "var(--text-primary)",
    background: "var(--bg-hover)",
  } satisfies CSSProperties,
} as const;
