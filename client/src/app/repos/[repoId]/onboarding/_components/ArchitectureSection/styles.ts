import type { CSSProperties } from "react";

export const s = {
  diagram: { marginTop: 12, overflowX: "auto" } satisfies CSSProperties,
  missing: { marginTop: 12, fontSize: 13, color: "var(--text-muted)", display: "flex", gap: 8 } satisfies CSSProperties,
} as const;
