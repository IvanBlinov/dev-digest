import type { CSSProperties } from "react";

export const s = {
  body: { padding: "20px 24px 8px" } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
  urlRow: { display: "flex", gap: 10, alignItems: "center" } satisfies CSSProperties,
  urlInput: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  error: { fontSize: 12.5, color: "var(--crit)", marginTop: 8, lineHeight: 1.45 } satisfies CSSProperties,
  invalid: { fontSize: 12.5, color: "var(--crit)", marginTop: 8 } satisfies CSSProperties,
} as const;
