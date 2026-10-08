import type { CSSProperties } from "react";

export const s = {
  form: { display: "flex", flexDirection: "column", gap: 0 } satisfies CSSProperties,
  row: { display: "flex", gap: 12, flexWrap: "wrap" } satisfies CSSProperties,
  category: { width: 180 } satisfies CSSProperties,
  path: { flex: 1, minWidth: 220 } satisfies CSSProperties,
  line: { width: 96 } satisfies CSSProperties,
  selectLabel: { display: "block" } satisfies CSSProperties,
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  textarea: {
    width: "100%",
    resize: "vertical",
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    fontSize: 14,
    lineHeight: 1.5,
    outline: "none",
  } satisfies CSSProperties,
  mono: { fontSize: 12.5, whiteSpace: "pre" } satisfies CSSProperties,
  errors: { fontSize: 12, color: "var(--crit)", lineHeight: 1.5, marginBottom: 12 } satisfies CSSProperties,
  actions: { display: "flex", justifyContent: "flex-end", gap: 8 } satisfies CSSProperties,
} as const;
