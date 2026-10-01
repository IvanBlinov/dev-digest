import type { CSSProperties } from "react";

export const s = {
  wrap: { padding: "20px 28px 40px", maxWidth: 860 } satisfies CSSProperties,
  heading: { fontSize: 14, fontWeight: 600, marginBottom: 12 } satisfies CSSProperties,
  list: { border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" } satisfies CSSProperties,
  row: (first: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 16px",
    borderTop: first ? "none" : "1px solid var(--border)",
    background: "var(--bg-elevated)",
    fontSize: 13,
  }),
  version: { fontWeight: 700, minWidth: 36 } satisfies CSSProperties,
  message: { flex: 1, minWidth: 0, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  date: { color: "var(--text-muted)", fontSize: 12, whiteSpace: "nowrap" } satisfies CSSProperties,
  current: { color: "var(--ok, #10b981)", fontWeight: 600, fontSize: 12 } satisfies CSSProperties,
  diffBox: {
    borderTop: "1px solid var(--border)",
    background: "var(--bg-surface)",
    padding: "10px 0",
    maxHeight: 360,
    overflow: "auto",
  } satisfies CSSProperties,
  diffCaption: { fontSize: 12, color: "var(--text-muted)", padding: "0 16px 8px" } satisfies CSSProperties,
  diffLine: (kind: "add" | "del" | "same"): CSSProperties => ({
    fontSize: 12.5,
    lineHeight: "19px",
    padding: "0 16px",
    whiteSpace: "pre",
    color: kind === "add" ? "var(--ok, #10b981)" : kind === "del" ? "var(--crit)" : "var(--text-muted)",
    background: kind === "add" ? "var(--ok-bg, rgba(16,185,129,.08))" : kind === "del" ? "var(--crit-bg)" : "transparent",
    opacity: kind === "same" ? 0.75 : 1,
  }),
} as const;
