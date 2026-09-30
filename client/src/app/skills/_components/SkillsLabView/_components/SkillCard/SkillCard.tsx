/* SkillCard — one skill in the Skills Lab list: name, enabled toggle, 2-line description,
   type + source chips, `v<N> · <agent_count> agents`, and delete (with confirmation). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, IconBtn, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SkillTypeChip } from "@/components/skill-type-chip";
import { useDeleteSkill, useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { s } from "./styles";

export interface SkillCardProps {
  skill: Skill;
  active?: boolean;
  onSelect: (id: string) => void;
  /** Called after the skill was deleted on the server. */
  onDeleted?: (id: string) => void;
}

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

export function SkillCard({ skill, active, onSelect, onDeleted }: SkillCardProps) {
  const t = useTranslations("skills");
  const toast = useToast();
  const update = useUpdateSkill();
  const del = useDeleteSkill();
  const [confirming, setConfirming] = React.useState(false);
  const agentCount = skill.agent_count ?? 0;

  const toggle = (enabled: boolean) =>
    update.mutate({ id: skill.id, patch: { enabled } }, { onError: (e) => toast.error(e.message) });

  const confirmDelete = () =>
    del.mutate(skill.id, {
      onSuccess: () => {
        setConfirming(false);
        toast.success(t("delete.success", { name: skill.name }));
        onDeleted?.(skill.id);
      },
      onError: (e) => toast.error(t("delete.failed", { message: e.message })),
    });

  return (
    <>
      <div
        role="listitem"
        aria-current={active ? "true" : undefined}
        onClick={() => onSelect(skill.id)}
        style={s.card(!!active, skill.enabled)}
      >
        <div style={s.headerRow}>
          <div style={s.iconBox}>
            <Icon.Sparkles size={14} />
          </div>
          <span className="mono" style={s.name} title={skill.name}>
            {skill.name}
          </span>
          <span style={s.stop} onClick={stop} title={t("card.toggle", { name: skill.name })}>
            <Toggle on={skill.enabled} onChange={toggle} size={14} />
          </span>
          <span style={s.stop} onClick={stop}>
            <IconBtn icon="Trash" label={t("card.delete")} size={26} danger onClick={() => setConfirming(true)} />
          </span>
        </div>
        <div style={s.description}>{skill.description || t("card.noDescription")}</div>
        <div style={s.chips}>
          <SkillTypeChip type={skill.type} />
          <Badge>{t(`card.source.${skill.source}`)}</Badge>
        </div>
        <div className="tnum" style={s.meta}>
          {t("card.meta", { version: skill.version, count: agentCount })}
        </div>
      </div>
      {confirming && (
        <ConfirmDialog
          title={t("delete.title")}
          body={t("delete.body", { name: skill.name, count: agentCount })}
          confirmLabel={t("delete.confirm")}
          busy={del.isPending}
          onConfirm={confirmDelete}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}
