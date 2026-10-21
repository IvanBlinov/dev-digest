import type { CSSProperties } from "react";

export const s = {
  link: {
    color: "var(--accent-text)",
    textDecoration: "none",
    wordBreak: "break-all",
  } satisfies CSSProperties,
  text: { color: "var(--text-secondary)", wordBreak: "break-all" } satisfies CSSProperties,
} as const;
