/* SmartGroupHeader — sticky header of one role group in the reviewer-ordered diff:
   chevron, role label, one-line hint, files-with-findings counter, file count.
   Clicking it collapses/expands the whole group. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { SmartDiffRole } from "@devdigest/shared";
import { ROLE_HINT_KEY, ROLE_LABEL_KEY } from "../../constants";
import { s } from "./styles";

export function SmartGroupHeader({
  role,
  fileCount,
  flaggedCount,
  reviewed,
  open,
  onToggle,
}: {
  role: SmartDiffRole;
  fileCount: number;
  /** Files in this group with >=1 active finding. */
  flaggedCount: number;
  /** False before any review ran: no counter is shown. */
  reviewed: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("prReview.smartDiff");
  return (
    <button type="button" aria-expanded={open} onClick={onToggle} style={s.header}>
      <Icon.ChevronRight size={13} style={s.chevron(open)} />
      <span style={s.label}>{t(ROLE_LABEL_KEY[role])}</span>
      <span style={s.hint}>{t(ROLE_HINT_KEY[role])}</span>
      {reviewed && flaggedCount > 0 && (
        <span role="img" aria-label={t("filesWithFindings", { count: flaggedCount })} style={s.counter}>
          <span style={s.dot} />
          {flaggedCount}
        </span>
      )}
      <span className="tnum" style={s.count}>
        {t("filesCount", { count: fileCount })}
      </span>
    </button>
  );
}
