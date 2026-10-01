import type { CSSProperties } from "react";

export const s = {
  root: { maxWidth: 1040, margin: "0 auto", padding: "28px 32px 48px" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 20 } satisfies CSSProperties,
  titleBlock: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  h1: { fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: "-0.01em" } satisfies CSSProperties,
  repo: { color: "var(--accent-text)" } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", marginTop: 6 } satisfies CSSProperties,
  notice: (tone: "crit" | "info"): CSSProperties => ({
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    padding: "10px 14px",
    marginBottom: 16,
    borderRadius: 8,
    fontSize: 13,
    lineHeight: 1.5,
    border: `1px solid ${tone === "crit" ? "var(--crit)" : "var(--border-strong)"}`,
    background: tone === "crit" ? "var(--crit-bg)" : "var(--bg-elevated)",
    color: "var(--text-primary)",
  }),
  noticeIcon: { flexShrink: 0, marginTop: 2 } satisfies CSSProperties,
  noticeLink: { marginLeft: "auto", color: "var(--accent-text)", fontWeight: 600, whiteSpace: "nowrap" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  skeletons: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
} as const;
