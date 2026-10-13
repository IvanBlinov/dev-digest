import type { CSSProperties } from "react";

export const s = {
  headerRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  spacer: { marginLeft: "auto" } satisfies CSSProperties,
  summary: {
    margin: "4px 0 14px",
    padding: "2px 0 2px 12px",
    borderLeft: "3px solid var(--accent)",
    fontSize: 14.5,
    lineHeight: 1.55,
    color: "var(--text-primary)",
    fontStyle: "italic",
  } satisfies CSSProperties,
  columns: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 } satisfies CSSProperties,
  colTitle: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 6,
  } satisfies CSSProperties,
  list: { margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.55, color: "var(--text-secondary)" } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  sources: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 14 } satisfies CSSProperties,
  hint: { margin: "10px 0 0", fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  missing: {
    marginTop: 12,
    padding: "8px 12px",
    borderRadius: 6,
    background: "var(--warn-bg)",
    color: "var(--warn)",
    fontSize: 13,
  } satisfies CSSProperties,
  missingList: { margin: "4px 0 0", paddingLeft: 18 } satisfies CSSProperties,
  empty: { fontSize: 13.5, color: "var(--text-secondary)", margin: "0 0 12px" } satisfies CSSProperties,
} as const;
