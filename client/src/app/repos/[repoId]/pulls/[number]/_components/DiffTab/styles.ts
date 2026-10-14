import type { CSSProperties } from "react";

/** Co-located styles for DiffTab. */
export const s = {
  actions: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  notice: { margin: "-6px 0 12px", fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  groups: { display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  group: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
};
