/* FindingsPreviewPopover — hover/focus card listing up to `max` findings for a
   PR, a run, or an agent (L01). Pure presentation: the caller supplies the
   findings (already filtered by the severity rule) and an optional prefix per
   row (agent name on the PR list, `#pr` on the agent card). */
"use client";

import React from "react";
import { Icon } from "@devdigest/ui";
import { SEVERITY_LEVELS, sortBySeverity } from "@/lib/findings";
import { s } from "./styles";

export interface PreviewFinding {
  id: string;
  severity: string;
  category: string;
  title: string;
  file: string;
  start_line: number;
  end_line: number;
  confidence: number;
  rationale: string;
}

export interface FindingsPreviewPopoverProps<T extends PreviewFinding> {
  /** Header, e.g. "6 findings" or "2 findings in this run". */
  title: string;
  findings: readonly T[];
  /** Shown while the findings are being fetched (hover-triggered loads). */
  loading?: boolean;
  max?: number;
  renderPrefix?: (f: T) => React.ReactNode;
  children: React.ReactNode;
}

const OPEN_DELAY_MS = 150;
const RATIONALE_CHARS = 140;

function excerpt(text: string): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > RATIONALE_CHARS ? `${one.slice(0, RATIONALE_CHARS - 1)}…` : one;
}

export function FindingsPreviewPopover<T extends PreviewFinding>({
  title,
  findings,
  loading = false,
  max = 6,
  renderPrefix,
  children,
}: FindingsPreviewPopoverProps<T>) {
  const [open, setOpen] = React.useState(false);
  const [above, setAbove] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchor = React.useRef<HTMLSpanElement | null>(null);

  const show = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const rect = anchor.current?.getBoundingClientRect();
      // Flip above the anchor when there is not enough room below.
      setAbove(Boolean(rect && typeof window !== "undefined" && window.innerHeight - rect.bottom < 320));
      setOpen(true);
    }, OPEN_DELAY_MS);
  }, []);
  const hide = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setOpen(false);
  }, []);
  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const rows = sortBySeverity(findings).slice(0, max);
  const more = Math.max(0, findings.length - rows.length);

  return (
    <span
      ref={anchor}
      style={s.anchor}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onKeyDown={(e) => {
        if (e.key === "Escape") hide();
      }}
    >
      {children}
      {open && (
        <div role="dialog" aria-label={title} style={s.card(above)} onClick={(e) => e.stopPropagation()}>
          <div style={s.header}>
            <Icon.Info size={12} />
            {title}
          </div>
          {loading && rows.length === 0 && <div style={s.muted}>Loading…</div>}
          {!loading && rows.length === 0 && <div style={s.muted}>No active findings.</div>}
          {rows.map((f) => {
            const meta = SEVERITY_LEVELS.find((m) => m.level === f.severity);
            const I = meta ? Icon[meta.icon] : Icon.Info;
            return (
              <div key={f.id} style={s.row}>
                <div style={s.titleRow}>
                  <span style={s.sevIcon(meta?.color ?? "var(--text-muted)", meta?.bg ?? "transparent")}>
                    <I size={12} />
                  </span>
                  {renderPrefix && <span style={s.prefix}>{renderPrefix(f)}</span>}
                  <span style={s.title}>{f.title}</span>
                  <span style={s.category}>{f.category}</span>
                </div>
                <div style={s.locRow}>
                  <span className="mono" style={s.loc}>
                    {f.file}:{f.start_line}
                    {f.end_line !== f.start_line ? `-${f.end_line}` : ""}
                  </span>
                  <span style={s.conf}>● {Math.round(f.confidence * 100)}% conf</span>
                </div>
                <div style={s.rationale}>{excerpt(f.rationale)}</div>
              </div>
            );
          })}
          {more > 0 && <div style={s.more}>+{more} more</div>}
        </div>
      )}
    </span>
  );
}
