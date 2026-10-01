import type { CSSProperties } from "react";

/** Co-located styles for the agent editor's Skills tab. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700, marginBottom: 14 } satisfies CSSProperties,
  hint: { fontSize: 13, color: "var(--text-muted)", margin: "10px 0 14px", lineHeight: 1.5 } satisfies CSSProperties,
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "hidden",
  } satisfies CSSProperties,
  row: (opts: { dimmed: boolean; dragging: boolean; dropTarget: boolean }): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderBottom: "1px solid var(--border)",
    background: opts.dropTarget ? "var(--bg-hover)" : "var(--bg-elevated)",
    opacity: opts.dragging ? 0.4 : opts.dimmed ? 0.55 : 1,
    boxShadow: opts.dropTarget ? "inset 0 2px 0 var(--accent)" : undefined,
  }),
  handle: {
    display: "inline-flex",
    color: "var(--text-muted)",
    cursor: "grab",
    width: 16,
  } satisfies CSSProperties,
  handleSpacer: { width: 16, flexShrink: 0 } satisfies CSSProperties,
  checkboxOff: { pointerEvents: "none", opacity: 0.6 } satisfies CSSProperties,
  nameCell: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 } satisfies CSSProperties,
  blockedHint: { fontSize: 12, color: "var(--crit)" } satisfies CSSProperties,
  name: {
    fontSize: 13,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  offHint: { fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" } satisfies CSSProperties,
  moveBtns: { display: "inline-flex", gap: 2 } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", padding: "16px 0" } satisfies CSSProperties,
} as const;
