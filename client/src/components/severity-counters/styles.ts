import type { CSSProperties } from "react";

export const s = {
  muted: { color: "var(--text-muted)", fontSize: 12 } satisfies CSSProperties,
  clean: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    color: "var(--ok)",
    fontSize: 12,
    fontWeight: 600,
  } satisfies CSSProperties,
  group: (variant: "chips" | "inline"): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: variant === "inline" ? 8 : 10,
  }),
  chip: (color: string, bg: string, active: boolean, interactive: boolean, variant: "chips" | "inline"): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: variant === "inline" ? "0 0 1px" : "2px 6px",
    borderRadius: variant === "inline" ? 0 : 5,
    border: "none",
    borderBottom: variant === "inline" ? `1px dotted ${color}` : "none",
    background: variant === "inline" ? "transparent" : active ? bg : "transparent",
    boxShadow: active && variant === "chips" ? `inset 0 0 0 1px ${color}` : "none",
    color,
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1.2,
    cursor: interactive ? "pointer" : "default",
    textDecoration: "none",
    font: "inherit",
  }),
};
