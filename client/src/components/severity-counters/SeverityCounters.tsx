/* SeverityCounters — `⊘ 3 · ⚠ 5 · 💡 2` chips (L01). Renders only non-zero
   levels; `✓ 0` when reviewed-and-clean; `—` when never reviewed (null).
   Each level is a real button (keyboard + aria) that can filter or navigate. */
"use client";

import React from "react";
import { Icon } from "@devdigest/ui";
import type { SeverityCounts } from "@devdigest/shared";
import { SEVERITY_LEVELS, totalCount, type SeverityLevel } from "@/lib/findings";
import { s } from "./styles";

export interface SeverityCountersProps {
  counts: SeverityCounts | null | undefined;
  /** Highlighted level (the active filter), if any. */
  active?: SeverityLevel | null;
  /** Click handler; when omitted the chips are static. */
  onSelect?: (level: SeverityLevel) => void;
  /** Optional link target per level (renders `<a>` instead of `<button>`). */
  hrefFor?: (level: SeverityLevel) => string;
  /** `inline` = compact, for dense rows (timeline, accordion header). */
  variant?: "chips" | "inline";
}

export function SeverityCounters({ counts, active = null, onSelect, hrefFor, variant = "chips" }: SeverityCountersProps) {
  if (counts == null) {
    return (
      <span style={s.muted} aria-label="Not reviewed yet">
        —
      </span>
    );
  }
  if (totalCount(counts) === 0) {
    return (
      <span style={s.clean} aria-label="Reviewed, no active findings">
        <Icon.CheckCircle size={12} /> 0
      </span>
    );
  }
  const interactive = Boolean(onSelect || hrefFor);
  return (
    <span style={s.group(variant)} role="group" aria-label="Findings by severity">
      {SEVERITY_LEVELS.filter((m) => counts[m.key] > 0).map((m) => {
        const n = counts[m.key];
        const I = Icon[m.icon];
        const label = `${n} ${m.label.toLowerCase()} finding${n === 1 ? "" : "s"}${interactive ? ", filter" : ""}`;
        const isActive = active === m.level;
        const style = s.chip(m.color, m.bg, isActive, interactive, variant);
        const body = (
          <>
            <I size={variant === "inline" ? 11 : 12} />
            <span className="mono tnum">{n}</span>
          </>
        );
        if (hrefFor) {
          return (
            <a
              key={m.level}
              href={hrefFor(m.level)}
              aria-label={label}
              aria-pressed={isActive || undefined}
              style={style}
              onClick={(e) => {
                e.stopPropagation();
                if (onSelect) {
                  e.preventDefault();
                  onSelect(m.level);
                }
              }}
            >
              {body}
            </a>
          );
        }
        return (
          <button
            key={m.level}
            type="button"
            aria-label={label}
            aria-pressed={isActive || undefined}
            disabled={!interactive}
            style={style}
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.(m.level);
            }}
          >
            {body}
          </button>
        );
      })}
    </span>
  );
}
