import type { CSSProperties } from "react";

export const s = {
  card: ({ active, enabled, blocked }: { active: boolean; enabled: boolean; blocked: boolean }): CSSProperties => ({
    padding: 12,
    borderRadius: 8,
    cursor: "pointer",
    border: "1px solid " + (blocked ? "var(--crit)" : active ? "var(--accent)" : "var(--border)"),
    background: active ? "var(--bg-hover)" : "var(--bg-elevated)",
    opacity: enabled ? 1 : 0.6,
    marginBottom: 10,
  }),
  headerRow: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  iconBox: {
    width: 26,
    height: 26,
    borderRadius: 7,
    background: "var(--accent-bg)",
    color: "var(--accent)",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  } satisfies CSSProperties,
  name: {
    fontSize: 13,
    fontWeight: 600,
    flex: "1 1 auto",
    // Never squeezed to nothing by the injection chip + toggle on narrow cards.
    minWidth: 72,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  stop: { display: "inline-flex" } satisfies CSSProperties,
  /** The injection chip gives way (truncates) before the name does. */
  chipSlot: { flex: "0 1 auto", minWidth: 0, overflow: "hidden", display: "inline-flex" } satisfies CSSProperties,
  description: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    margin: "8px 0",
    lineHeight: 1.4,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  } satisfies CSSProperties,
  chips: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" } satisfies CSSProperties,
  blocked: { fontSize: 12, fontWeight: 600, color: "var(--crit)", marginTop: 4 } satisfies CSSProperties,
  meta: { fontSize: 12, color: "var(--text-muted)", marginTop: 8 } satisfies CSSProperties,
} as const;
