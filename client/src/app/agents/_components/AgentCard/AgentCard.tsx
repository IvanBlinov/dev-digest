/* AgentCard — name, description, model chip, enabled toggle, linked-skills counter,
   L01 findings counters, and a Delete button guarded by a confirm modal (L02 reqs 32–34). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, IconBtn, Toggle } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useDeleteAgent, useAgentFindings } from "../../../../lib/hooks/agents";
import { totalCount } from "@/lib/findings";
import { SeverityCounters } from "@/components/severity-counters";
import { FindingsPreviewPopover } from "@/components/findings-preview-popover";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/lib/toast";
import { modelColor } from "./helpers";
import { s } from "./styles";

export function AgentCard({
  ag,
  active,
  skillCount,
  onClick,
  onToggle,
  onDeleted,
}: {
  ag: Agent;
  active?: boolean;
  /** Overrides `ag.skill_count` (enabled links) when the caller knows better. */
  skillCount?: number;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
  /** Called after the agent was deleted (e.g. to leave its editor page). */
  onDeleted?: (id: string) => void;
}) {
  const t = useTranslations("agents");
  const toast = useToast();
  const del = useDeleteAgent();
  const [confirming, setConfirming] = React.useState(false);
  const skills = skillCount ?? ag.skill_count;
  const confirmDelete = () =>
    del.mutate(ag.id, {
      onSuccess: () => {
        setConfirming(false);
        toast.success(t("card.deleted", { name: ag.name }));
        onDeleted?.(ag.id);
      },
      // Keep the modal open on failure (mirrors SkillCard) so the user can retry or cancel.
      onError: (e) => toast.error(t("card.deleteFailed", { message: e.message })),
    });
  const color = modelColor(ag.model);
  // L01 — findings by severity (workspace-wide); the preview loads on hover only.
  const [previewOn, setPreviewOn] = React.useState(false);
  const total = ag.findings ? totalCount(ag.findings) : 0;
  const preview = useAgentFindings(ag.id, previewOn && total > 0);
  return (
    <div onClick={onClick} style={s.card(!!active, ag.enabled)}>
      {confirming && (
        // Stop clicks inside the modal from bubbling (via the React tree) to the card's onClick.
        <div onClick={(e) => e.stopPropagation()}>
          <ConfirmDialog
            title={t("card.deleteTitle")}
            body={t("card.deleteBody", { name: ag.name })}
            confirmLabel={t("card.deleteConfirm")}
            onConfirm={confirmDelete}
            onCancel={() => setConfirming(false)}
            busy={del.isPending}
          />
        </div>
      )}
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
        <span onClick={(e) => e.stopPropagation()} style={s.deleteBtn}>
          <IconBtn icon="Trash" size={24} label={t("card.delete")} danger onClick={() => setConfirming(true)} />
        </span>
      </div>
      <div style={s.description}>{ag.description || t("card.noDescription")}</div>
      <div style={s.metaRow}>
        <span className="mono" style={s.modelChip(color)}>
          {ag.model}
        </span>
        {skills != null && (
          <Badge color="var(--text-secondary)" icon="Sparkles">
            {t("card.skillCount", { count: skills })}
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
