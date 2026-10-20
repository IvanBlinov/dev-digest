import type { CSSProperties } from "react";

export const s = {
  descriptionBox: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    fontSize: 14,
    color: "var(--text-secondary)",
    lineHeight: 1.55,
  } satisfies CSSProperties,
  // Wraps to one column on narrow screens; cards stretch to equal height.
  twoCol: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
    gap: 16,
    alignItems: "stretch",
  } satisfies CSSProperties,
  leftCol: { display: "flex", flexDirection: "column", gap: 16, minWidth: 0 } satisfies CSSProperties,
} as const;
