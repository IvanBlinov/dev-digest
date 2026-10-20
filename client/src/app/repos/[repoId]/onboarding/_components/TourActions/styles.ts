import type { CSSProperties } from "react";

export const s = {
  group: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  note: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  alert: { fontSize: 12.5, color: "var(--crit)" } satisfies CSSProperties,
} as const;
