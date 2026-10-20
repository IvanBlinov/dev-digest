import type { CSSProperties } from "react";

export const s = {
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  title: { fontWeight: 650, fontSize: 14 } satisfies CSSProperties,
  paths: { display: "flex", flexWrap: "wrap", gap: 10, fontSize: 12.5 } satisfies CSSProperties,
  link: { textDecoration: "underline" } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
} as const;
