import type { CSSProperties } from "react";
import type { AgentRunStatus } from "../../helpers";

const STATUS_COLOR: Record<AgentRunStatus, string> = {
  queued: "var(--text-muted)",
  running: "var(--accent-text)",
  done: "var(--ok)",
  failed: "var(--crit)",
};

export const s = {
  section: (status?: AgentRunStatus): CSSProperties => ({
    border: "1px solid var(--border)",
    borderLeft: `3px solid ${status ? STATUS_COLOR[status] : "var(--border-strong)"}`,
    borderRadius: 8,
    background: "var(--bg-elevated)",
    overflow: "hidden",
  }),
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "9px 12px",
    background: "transparent",
    border: "none",
    color: "var(--text-primary)",
    cursor: "pointer",
    textAlign: "left",
    minWidth: 0,
  } satisfies CSSProperties,
  title: { fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap" } satisfies CSSProperties,
  status: (status: AgentRunStatus): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 12,
    color: STATUS_COLOR[status],
    whiteSpace: "nowrap",
  }),
  count: { fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" } satisfies CSSProperties,
  last: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    color: "var(--text-secondary)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    textAlign: "right",
  } satisfies CSSProperties,
  body: { borderTop: "1px solid var(--border)" } satisfies CSSProperties,
} as const;
