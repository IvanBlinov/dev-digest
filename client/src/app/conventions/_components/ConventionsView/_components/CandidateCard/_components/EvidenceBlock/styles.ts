import type { CSSProperties } from "react";

export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "hidden",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "4px 6px 4px 12px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  location: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    color: "var(--accent-text)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  snippet: {
    margin: 0,
    padding: "10px 12px",
    fontSize: 12.5,
    lineHeight: 1.55,
    color: "var(--text-primary)",
    whiteSpace: "pre",
    overflowX: "auto",
    maxHeight: 220,
  } satisfies CSSProperties,
} as const;
