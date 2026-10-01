import type { CSSProperties } from "react";

export const s = {
  footer: { display: "flex", justifyContent: "flex-end", gap: 8 } satisfies CSSProperties,
  body: { padding: "18px 24px", fontSize: 14, lineHeight: 1.55, color: "var(--text-secondary)" } satisfies CSSProperties,
};
