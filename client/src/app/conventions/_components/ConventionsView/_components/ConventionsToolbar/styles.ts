import type { CSSProperties } from "react";

export const s = {
  bar: { display: "flex", alignItems: "center", gap: 12, padding: "4px 0 14px" } satisfies CSSProperties,
  count: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  create: { marginLeft: "auto" } satisfies CSSProperties,
} as const;
