import type { CSSProperties } from "react";

export const s = {
  root: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12, padding: "16px 28px 4px", flexShrink: 0 } satisfies CSSProperties,
  icon: { color: "var(--accent)" } satisfies CSSProperties,
  title: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  banner: {
    margin: "16px 28px 0",
    padding: "14px 16px",
    borderRadius: 8,
    border: "1px solid var(--crit)",
    background: "var(--crit-bg)",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    flexShrink: 0,
    maxHeight: "40%",
    overflow: "auto",
  } satisfies CSSProperties,
  bannerHead: { display: "flex", alignItems: "flex-start", gap: 10 } satisfies CSSProperties,
  bannerIcon: { color: "var(--crit)", flexShrink: 0, marginTop: 1 } satisfies CSSProperties,
  bannerTitle: { fontSize: 13.5, fontWeight: 700, color: "var(--crit)", letterSpacing: 0.3 } satisfies CSSProperties,
  bannerBody: { fontSize: 13, color: "var(--text-secondary)", marginTop: 2 } satisfies CSSProperties,
  body: { flex: 1, minHeight: 0, overflow: "auto" } satisfies CSSProperties,
  loading: { flex: 1, padding: 28, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
} as const;
