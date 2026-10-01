import type { CSSProperties } from "react";

export const s = {
  wrap: { padding: "20px 28px 40px", maxWidth: 860 } satisfies CSSProperties,
  enabledRow: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  enabledLabel: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 10, marginTop: 4 } satisfies CSSProperties,
  error: { fontSize: 12, color: "var(--crit)", marginTop: 8 } satisfies CSSProperties,
} as const;
