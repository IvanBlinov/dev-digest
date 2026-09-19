import type { CSSProperties } from "react";

/** Co-located styles for FindingsPanel (extracted from inline styles). */
export const s = {
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  divider: {
    width: 1,
    height: 18,
    background: "var(--border)",
    margin: "0 2px",
  } satisfies CSSProperties,
  toggleGroup: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  /** L01 — severity filter bar (All · Critical · Warning · Suggestion). */
  filterBar: { display: "flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
  filterChip: (active: boolean, color: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "3px 9px",
    borderRadius: 999,
    border: `1px solid ${active ? color : "var(--border)"}`,
    background: active ? "var(--bg-hover)" : "transparent",
    color: active ? color : "var(--text-secondary)",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    font: "inherit",
  }),
} as const;
