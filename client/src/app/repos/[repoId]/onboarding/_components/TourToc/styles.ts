import type { CSSProperties } from "react";

export const s = {
  nav: { position: "sticky", top: 72, alignSelf: "flex-start", width: 200, flexShrink: 0 } satisfies CSSProperties,
  label: { fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 8 } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  link: { fontSize: 13, color: "var(--text-secondary)", textDecoration: "none" } satisfies CSSProperties,
  linkActive: { fontSize: 13, color: "var(--text-primary)", fontWeight: 650, textDecoration: "none" } satisfies CSSProperties,
} as const;
