import type { CSSProperties } from "react";

export const s = {
  summary: { margin: 0, fontSize: 14.5, lineHeight: 1.55, color: "var(--text-primary)", whiteSpace: "pre-wrap" } satisfies CSSProperties,
  empty: { display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" } satisfies CSSProperties,
  hint: { margin: 0, fontSize: 13.5, color: "var(--text-muted)" } satisfies CSSProperties,
  skeletons: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  banner: (tone: "warn" | "crit"): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    padding: "8px 12px",
    borderRadius: 6,
    marginBottom: 12,
    fontSize: 13,
    color: tone === "warn" ? "var(--warn)" : "var(--crit)",
    background: tone === "warn" ? "var(--warn-bg)" : "var(--bg-hover)",
  }),
  link: { color: "var(--accent-text)" } satisfies CSSProperties,
  meta: { marginTop: 12, display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  footer: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
