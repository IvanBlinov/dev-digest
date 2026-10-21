import type { CSSProperties } from "react";

export const s = {
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  item: { display: "flex", gap: 8, alignItems: "baseline", fontSize: 14, lineHeight: 1.5 } satisfies CSSProperties,
  bullet: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  reason: { color: "var(--text-secondary)" } satisfies CSSProperties,
  muted: { fontSize: 13.5, color: "var(--text-muted)" } satisfies CSSProperties,
  skeletons: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
} as const;
