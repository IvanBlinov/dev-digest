import type { CSSProperties } from "react";

export const s = {
  error: { fontSize: 12, color: "var(--crit)", marginTop: 8, lineHeight: 1.45 } satisfies CSSProperties,
} as const;
