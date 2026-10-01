import type { CSSProperties } from "react";

export const s = {
  wrap: { padding: "20px 28px 40px", maxWidth: 860 } satisfies CSSProperties,
  caption: { fontSize: 13, color: "var(--text-muted)", marginBottom: 14 } satisfies CSSProperties,
  card: {
    padding: "18px 22px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    fontSize: 14,
  } satisfies CSSProperties,
} as const;
