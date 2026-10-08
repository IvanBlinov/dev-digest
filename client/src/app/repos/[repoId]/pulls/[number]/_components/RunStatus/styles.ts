import type { CSSProperties } from "react";

/** Co-located styles for RunStatus. */
export const s = {
  wrap: { marginBottom: 10, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  summary: { fontSize: 12.5, color: "var(--warn)", fontWeight: 600 } satisfies CSSProperties,
} as const;
