import type { CSSProperties } from "react";

export const s = {
  body: { padding: "18px 24px 4px" } satisfies CSSProperties,
  banner: {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    padding: "10px 12px",
    marginBottom: 18,
    borderRadius: 8,
    border: "1px solid var(--accent)",
    background: "var(--accent-bg)",
    color: "var(--text-secondary)",
    fontSize: 13,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  bannerIcon: { color: "var(--accent-text)", flexShrink: 0, marginTop: 2 } satisfies CSSProperties,
  repo: { color: "var(--accent-text)" } satisfies CSSProperties,
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 16 } satisfies CSSProperties,
  toggleRow: { display: "flex", alignItems: "center", gap: 10, minHeight: 42 } satisfies CSSProperties,
  toggleHint: { fontSize: 12, color: "var(--text-muted)", lineHeight: 1.45 } satisfies CSSProperties,
  error: { fontSize: 12, color: "var(--crit)", marginTop: 8, lineHeight: 1.45 } satisfies CSSProperties,
  loading: { fontSize: 13, color: "var(--text-muted)", padding: "36px 24px", textAlign: "center" } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  footerNote: { flex: 1, fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
