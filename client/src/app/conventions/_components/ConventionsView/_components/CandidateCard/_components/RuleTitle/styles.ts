import type { CSSProperties } from "react";

const text: CSSProperties = {
  margin: 0,
  fontSize: 14.5,
  fontStyle: "italic",
  lineHeight: 1.5,
  color: "var(--text-primary)",
};

export const s = {
  title: (disabled: boolean): CSSProperties => ({
    ...text,
    cursor: disabled ? "default" : "text",
    borderRadius: 6,
    padding: "2px 6px",
    margin: "0 -6px",
    border: "1px dashed transparent",
  }),
  wrap: { display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  field: (invalid: boolean): CSSProperties => ({
    ...text,
    fontFamily: "inherit",
    width: "100%",
    resize: "vertical",
    padding: "6px 8px",
    borderRadius: 6,
    border: `1px solid ${invalid ? "var(--crit)" : "var(--accent)"}`,
    background: "var(--bg-surface)",
    outline: "none",
  }),
  error: { fontSize: 12, color: "var(--crit)" } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
