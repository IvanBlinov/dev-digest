import type { CSSProperties } from "react";

/** Co-located styles for SmartGroupHeader. Opaque + sticky so file cards scroll under it. */
export const s = {
  header: {
    position: "sticky",
    top: 0,
    zIndex: 2,
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "9px 12px",
    border: "1px solid var(--border)",
    borderRadius: 7,
    background: "var(--bg-surface)",
    color: "var(--text-primary)",
    cursor: "pointer",
    textAlign: "left",
  } satisfies CSSProperties,
  label: { fontSize: 13, fontWeight: 700 } satisfies CSSProperties,
  hint: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    color: "var(--text-muted)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  counter: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12,
    fontWeight: 600,
    color: "var(--crit)",
  } satisfies CSSProperties,
  dot: { width: 8, height: 8, borderRadius: "50%", background: "var(--crit)" } satisfies CSSProperties,
  count: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  chevron: (open: boolean): CSSProperties => ({
    color: "var(--text-muted)",
    transform: open ? "rotate(90deg)" : "none",
    transition: "transform .12s",
  }),
};
