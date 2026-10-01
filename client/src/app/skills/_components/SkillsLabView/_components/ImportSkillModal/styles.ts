import type { CSSProperties } from "react";

export const s = {
  body: { padding: "20px 24px 8px" } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
  fileInput: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  error: { fontSize: 12.5, color: "var(--crit)", marginTop: 8, lineHeight: 1.45 } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
