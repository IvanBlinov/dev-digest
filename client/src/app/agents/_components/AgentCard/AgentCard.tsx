/* AgentCard — model chip, skills count, enabled toggle. Stats are an A5 mount;
   we render the provider/model + skill count here. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useDeleteAgent, useAgentFindings } from "../../../../lib/hooks/agents";
import { totalCount } from "@/lib/findings";
import { SeverityCounters } from "@/components/severity-counters";
import { FindingsPreviewPopover } from "@/components/findings-preview-popover";
import { modelColor } from "./helpers";
import { s } from "./styles";

export function AgentCard({
  ag,
  active,
  skillCount,
  onClick,
  onToggle,
}: {
  ag: Agent;
  active?: boolean;
  skillCount?: number;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("agents");
  const del = useDeleteAgent();
  const color = modelColor(ag.model);
  // L01 — findings by severity (workspace-wide); the preview loads on hover only.
  const [previewOn, setPreviewOn] = React.useState(false);
  const total = ag.findings ? totalCount(ag.findings) : 0;
  const preview = useAgentFindings(ag.id, previewOn && total > 0);
  return (
    <div onClick={onClick} style={s.card(!!active, ag.enabled)}>
      <div style={s.headerRow}>
        <div style={s.iconBox}>
          <Icon.Cpu size={15} />
        </div>
        <span style={s.name}>{ag.name}</span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={ag.enabled} onChange={onToggle} size={14} />
          </div>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(`Delete agent "${ag.name}"? This cannot be undone.`)) del.mutate(ag.id);
          }}
          disabled={del.isPending}
          title="Delete agent"
          aria-label="Delete agent"
          style={{
            background: "none",
            border: "none",
            cursor: del.isPending ? "not-allowed" : "pointer",
            color: "var(--text-muted)",
            display: "inline-flex",
            padding: 4,
          }}
        >
          <Icon.Trash size={14} style={del.isPending ? { animation: "ddspin 1s linear infinite" } : undefined} />
        </button>
      </div>
      <div style={s.description}>{ag.description || t("card.noDescription")}</div>
      <div style={s.metaRow}>
        <span className="mono" style={s.modelChip(color)}>
          {ag.model}
        </span>
        {skillCount != null && (
          <Badge color="var(--text-secondary)" icon="Sparkles">
            {t("card.skillCount", { count: skillCount })}
          </Badge>
        )}
        <span
          style={{ marginLeft: "auto", display: "inline-flex" }}
          title={t("card.findings")}
          onMouseEnter={() => setPreviewOn(true)}
          onClick={(e) => e.stopPropagation()}
        >
          {total > 0 ? (
            <FindingsPreviewPopover
              title={t("card.findingsPreview", { count: total })}
              findings={preview.data ?? []}
              loading={preview.isLoading}
              renderPrefix={(f) => `#${f.pr_number}`}
            >
              <SeverityCounters counts={ag.findings} />
            </FindingsPreviewPopover>
          ) : (
            <SeverityCounters counts={ag.findings ?? null} />
          )}
        </span>
      </div>
    </div>
  );
}
