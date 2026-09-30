import type { CSSProperties } from "react";

export const s = {
  body: { padding: "20px 24px 8px" } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
  fileInput: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  error: { fontSize: 12.5, color: "var(--crit)", marginTop: 8, lineHeight: 1.45 } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  divider: { height: 1, background: "var(--border)", margin: "4px 0 20px" } satisfies CSSProperties,
  sourceFile: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  previewBox: {
    maxHeight: 260,
    overflow: "auto",
    padding: "12px 16px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 13.5,
  } satisfies CSSProperties,
  list: { margin: 0, paddingLeft: 18, fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.6 } satisfies CSSProperties,
  warnings: { margin: 0, paddingLeft: 18, fontSize: 12.5, color: "var(--warn, #f59e0b)", lineHeight: 1.6 } satisfies CSSProperties,
} as const;
