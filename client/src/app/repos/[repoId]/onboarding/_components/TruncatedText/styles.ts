import type { CSSProperties } from "react";

export const s = {
  wrap: { position: "relative", display: "inline-block", maxWidth: "100%", minWidth: 0 } satisfies CSSProperties,
  text: {
    display: "block",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: "100%",
  } satisfies CSSProperties,
  tooltip: {
    position: "absolute",
    left: 0,
    top: "100%",
    marginTop: 4,
    zIndex: 20,
    maxWidth: 480,
    padding: "4px 8px",
    borderRadius: 6,
    background: "var(--bg-elevated, var(--bg-hover))",
    border: "1px solid var(--border)",
    color: "var(--text-primary)",
    fontSize: 12,
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
    boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
  } satisfies CSSProperties,
} as const;
