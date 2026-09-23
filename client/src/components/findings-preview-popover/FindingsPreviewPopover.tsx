/* FindingsPreviewPopover — hover/focus card listing up to `max` findings for a
   PR, a run, or an agent (L01). Pure presentation: the caller supplies the
   findings (already filtered by the severity rule) and an optional prefix per
   row (agent name on the PR list, `#pr` on the agent card).

   The card is rendered in a PORTAL with `position: fixed`, so it is never
   clipped by an `overflow: hidden` ancestor (the PR table card, the agent card)
   and can flip above the trigger near the viewport bottom. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { Icon } from "@devdigest/ui";
import { SEVERITY_LEVELS, sortBySeverity } from "@/lib/findings";
import { s, CARD_WIDTH } from "./styles";

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
/** Grace period when the pointer travels from the trigger into the card. */
const CLOSE_DELAY_MS = 120;
const RATIONALE_CHARS = 140;
const GAP = 8;
const EDGE = 8;
/** Estimated card height used only to decide whether to flip above. */
const FLIP_THRESHOLD = 320;

interface Placement {
  left: number;
  top?: number;
  bottom?: number;
}

function excerpt(text: string): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > RATIONALE_CHARS ? `${one.slice(0, RATIONALE_CHARS - 1)}…` : one;
}

/** Fixed-position placement below (or above) the anchor, clamped to the viewport. */
function placeFor(rect: DOMRect): Placement {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.max(EDGE, Math.min(rect.left, vw - CARD_WIDTH - EDGE));
  const roomBelow = vh - rect.bottom;
  if (roomBelow < FLIP_THRESHOLD && rect.top > roomBelow) {
    return { left, bottom: vh - rect.top + GAP };
  }
  return { left, top: rect.bottom + GAP };
}

export function FindingsPreviewPopover<T extends PreviewFinding>({
  title,
  findings,
  loading = false,
  max = 6,
  renderPrefix,
  children,
}: FindingsPreviewPopoverProps<T>) {
  const [placement, setPlacement] = React.useState<Placement | null>(null);
  const openTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchor = React.useRef<HTMLSpanElement | null>(null);

  const clearTimers = () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  };

  const show = React.useCallback(() => {
    clearTimers();
    openTimer.current = setTimeout(() => {
      const rect = anchor.current?.getBoundingClientRect();
      if (rect) setPlacement(placeFor(rect));
    }, OPEN_DELAY_MS);
  }, []);

  /** Close after a grace period so the pointer can move into the card. */
  const scheduleHide = React.useCallback(() => {
    clearTimers();
    closeTimer.current = setTimeout(() => setPlacement(null), CLOSE_DELAY_MS);
  }, []);

  const hideNow = React.useCallback(() => {
    clearTimers();
    setPlacement(null);
  }, []);

  /** Pointer entered the card: cancel the pending close. */
  const keepOpen = React.useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);

  // A scrolled/resized page invalidates the fixed placement — just close.
  React.useEffect(() => {
    if (!placement) return;
    window.addEventListener("scroll", hideNow, true);
    window.addEventListener("resize", hideNow);
    return () => {
      window.removeEventListener("scroll", hideNow, true);
      window.removeEventListener("resize", hideNow);
    };
  }, [placement, hideNow]);

  React.useEffect(() => () => clearTimers(), []);

  const rows = sortBySeverity(findings).slice(0, max);
  const more = Math.max(0, findings.length - rows.length);

  const card = placement && (
    <div
      role="dialog"
      aria-label={title}
      style={s.card(placement)}
      onMouseEnter={keepOpen}
      onMouseLeave={scheduleHide}
      onClick={(e) => e.stopPropagation()}
    >
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
  );

  return (
    <span
      ref={anchor}
      style={s.anchor}
      onMouseEnter={show}
      onMouseLeave={scheduleHide}
      onFocus={show}
      onBlur={scheduleHide}
      onKeyDown={(e) => {
        if (e.key === "Escape") hideNow();
      }}
    >
      {children}
      {card && typeof document !== "undefined" ? createPortal(card, document.body) : null}
    </span>
  );
}
