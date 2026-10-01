import type { CSSProperties } from "react";

export const s = {
  divider: { height: 1, background: "var(--border)", margin: "4px 0 20px" } satisfies CSSProperties,
  injection: {
    marginBottom: 20,
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px solid var(--crit)",
    background: "var(--crit-bg)",
  } satisfies CSSProperties,
  injectionTitle: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13.5,
    fontWeight: 700,
    color: "var(--crit)",
  } satisfies CSSProperties,
  injectionBody: { fontSize: 13, color: "var(--text-secondary)", margin: "6px 0 10px", lineHeight: 1.45 } satisfies CSSProperties,
  source: { fontSize: 13, color: "var(--text-secondary)", wordBreak: "break-all" } satisfies CSSProperties,
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
