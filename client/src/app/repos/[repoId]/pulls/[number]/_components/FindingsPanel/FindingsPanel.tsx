/* FindingsPanel — hide-low-confidence + j/k navigation + FindingCard list,
   wiring the accept/dismiss action hook (A2). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle, EmptyState } from "@devdigest/ui";
import type { FindingRecord, SeverityCounts } from "@devdigest/shared";
import { SEVERITY_LEVELS, type SeverityLevel } from "@/lib/findings";
import { FindingCard } from "../FindingCard";
import { useFindingAction } from "../../../../../../../lib/hooks/reviews";
import { KEY_TO_ACTION } from "./constants";
import { visibleFindings } from "./helpers";
import { s } from "./styles";

export function FindingsPanel({
  findings,
  prId,
  repoFullName,
  headSha,
  severity = null,
  severityCounts = null,
  onSelectSeverity,
}: {
  findings: FindingRecord[];
  prId: string;
  /** L01 — active severity filter (URL-backed) and the counts for the filter bar. */
  severity?: SeverityLevel | null;
  severityCounts?: SeverityCounts | null;
  onSelectSeverity?: (level: SeverityLevel) => void;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("prReview");
  const action = useFindingAction();
  const [hideLow, setHideLow] = React.useState(false);
  const [focusIdx, setFocusIdx] = React.useState(0);

  const shown = React.useMemo(() => visibleFindings(findings, hideLow, severity), [findings, hideLow, severity]);
  // Keep the keyboard cursor inside the (possibly shorter) filtered list.
  React.useEffect(() => {
    setFocusIdx((i) => Math.min(i, Math.max(shown.length - 1, 0)));
  }, [shown.length]);

  // j/k navigation + a/d shortcuts on the focused finding (keyboard).
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "j") setFocusIdx((i) => Math.min(i + 1, shown.length - 1));
      else if (e.key === "k") setFocusIdx((i) => Math.max(i - 1, 0));
      else if (KEY_TO_ACTION[e.key] && shown[focusIdx]) {
        action.mutate({ findingId: shown[focusIdx]!.id, action: KEY_TO_ACTION[e.key]!, prId });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shown, focusIdx, action, prId]);

  return (
    <div>
      <div style={s.toolbar}>
        {onSelectSeverity && (
          <div style={s.filterBar} role="group" aria-label="Filter by severity">
            <button
              type="button"
              aria-pressed={severity == null}
              style={s.filterChip(severity == null, "var(--text-secondary)")}
              onClick={() => severity && onSelectSeverity(severity)}
            >
              {t("panel.filter.all")}
            </button>
            {SEVERITY_LEVELS.map((m) => (
              <button
                key={m.level}
                type="button"
                aria-pressed={severity === m.level}
                style={s.filterChip(severity === m.level, m.color)}
                onClick={() => onSelectSeverity(m.level)}
              >
                {t(`panel.filter.${m.level}`)}
                {severityCounts ? <span className="mono tnum"> {severityCounts[m.key]}</span> : null}
              </button>
            ))}
          </div>
        )}
        <div style={s.toggleGroup}>
          {t("panel.hideLowConfidence")}
          <Toggle on={hideLow} onChange={setHideLow} size={16} />
        </div>
      </div>

      <div style={s.list}>
        {shown.length === 0 ? (
          <EmptyState
            icon="Filter"
            title={severity ? t("panel.filter.noneAtLevel", { level: t(`panel.filter.${severity}`).toLowerCase() }) : t("panel.noMatchTitle")}
            body={severity ? t("panel.filter.noneAtLevelBody") : t("panel.noMatchBody")}
          />
        ) : (
          shown.map((f, i) => (
            <FindingCard
              key={f.id}
              f={f}
              focused={i === focusIdx}
              defaultExpanded={i === 0}
              pending={action.isPending}
              repoFullName={repoFullName}
              headSha={headSha}
              onAction={(act) => action.mutate({ findingId: f.id, action: act, prId })}
            />
          ))
        )}
      </div>
    </div>
  );
}
