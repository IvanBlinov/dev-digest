/* LogSection — one collapsible block of the live review log: a header (name, status, line
   count, last line) that toggles the full log of that agent (or of the shared preparation). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, LiveLogStream, type LogLine } from "@devdigest/ui";
import type { AgentRunStatus } from "../../helpers";
import { LOG_HEIGHT } from "../../constants";
import { s } from "./styles";

export interface LogSectionProps {
  title: string;
  lines: LogLine[];
  status?: AgentRunStatus;
  last?: LogLine | null;
  defaultOpen?: boolean;
}

const STATUS_ICON: Record<AgentRunStatus, keyof typeof Icon> = {
  queued: "Clock",
  running: "RefreshCw",
  done: "CheckCircle",
  failed: "XCircle",
};

export function LogSection({ title, lines, status, last, defaultOpen = false }: LogSectionProps) {
  const t = useTranslations("prReview");
  const [open, setOpen] = React.useState(defaultOpen);
  const StatusIcon = status ? Icon[STATUS_ICON[status]] : null;

  return (
    <div style={s.section(status)}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} style={s.header}>
        {open ? <Icon.ChevronDown size={14} /> : <Icon.ChevronRight size={14} />}
        <span style={s.title}>{title}</span>
        {StatusIcon && status && (
          <span style={s.status(status)}>
            <StatusIcon size={12} />
            {t(`runStatus.section.${status}`)}
          </span>
        )}
        <span style={s.count}>{t("runStatus.section.lines", { count: lines.length })}</span>
        {!open && last && (
          <span className="mono" style={s.last} title={last.m}>
            {last.m}
          </span>
        )}
      </button>
      {open && (
        <div data-log-body style={s.body}>
          <LiveLogStream log={lines} running={status === "running"} height={LOG_HEIGHT} />
        </div>
      )}
    </div>
  );
}
