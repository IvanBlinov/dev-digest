import type { CSSProperties } from "react";

export const s = {
  page: { display: "flex", flexDirection: "column", gap: 20, padding: "24px 28px", minWidth: 0 } satisfies CSSProperties,
  body: { display: "flex", alignItems: "flex-start", gap: 24, minWidth: 0 } satisfies CSSProperties,
  cards: { display: "flex", flexDirection: "column", gap: 16, flex: 1, minWidth: 0 } satisfies CSSProperties,
  failed: { fontSize: 13, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
} as const;
