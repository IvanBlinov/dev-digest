import type { CSSProperties } from "react";
import { EDITOR_PAD_PX, LINE_HEIGHT_PX } from "./constants";

const mono: CSSProperties = {
  fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
  fontSize: 13,
  lineHeight: `${LINE_HEIGHT_PX}px`,
};

export const s = {
  card: {
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    overflow: "hidden",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderBottom: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 12,
  } satisfies CSSProperties,
  fileName: { color: "var(--text-secondary)", fontWeight: 600 } satisfies CSSProperties,
  tokens: { marginLeft: "auto", color: "var(--text-muted)" } satisfies CSSProperties,
  body: (height: number): CSSProperties => ({ display: "flex", height }),
  gutter: {
    ...mono,
    flexShrink: 0,
    minWidth: 44,
    padding: `${EDITOR_PAD_PX}px 10px ${EDITOR_PAD_PX}px 0`,
    textAlign: "right",
    color: "var(--text-muted)",
    background: "var(--bg-surface)",
    borderRight: "1px solid var(--border)",
    overflow: "hidden",
    userSelect: "none",
    whiteSpace: "pre",
  } satisfies CSSProperties,
  textarea: {
    ...mono,
    flex: 1,
    resize: "none",
    border: "none",
    outline: "none",
    padding: `${EDITOR_PAD_PX}px 12px`,
    background: "transparent",
    color: "var(--text-primary)",
    whiteSpace: "pre",
    overflow: "auto",
  } satisfies CSSProperties,
} as const;
