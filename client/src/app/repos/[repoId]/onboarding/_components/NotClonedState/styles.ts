import type { CSSProperties } from "react";

export const s = {
  root: { display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "48px 24px", textAlign: "center" } satisfies CSSProperties,
  title: { fontSize: 16, fontWeight: 650, margin: 0 } satisfies CSSProperties,
  meta: { fontSize: 13, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
  alert: { fontSize: 13, color: "var(--crit)", margin: 0 } satisfies CSSProperties,
} as const;
