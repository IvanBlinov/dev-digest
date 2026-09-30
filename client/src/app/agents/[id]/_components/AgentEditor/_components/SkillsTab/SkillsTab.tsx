/* SkillsTab — L02 agent editor tab: every workspace skill with a per-agent checkbox.
   Enabled links come first in prompt order (drag & drop or ↑/↓), the rest alphabetically.
   Every change persists immediately as a full ordered replacement (optimistic, rolled back on error). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Checkbox, ErrorState, Icon, IconBtn, Skeleton, TextInput } from "@devdigest/ui";
import { SkillTypeChip } from "@/components/skill-type-chip";
import { useAgentSkills, useSetAgentSkills } from "@/lib/hooks/agents";
import { useSkills } from "@/lib/hooks/skills";
import {
  buildRows,
  canCheck,
  countEffective,
  filterRows,
  linksToItems,
  moveSkill,
  reorderSkill,
  toggleSkill,
  toPayload,
  type LinkItem,
  type SkillRow,
} from "./helpers";
import { s } from "./styles";

export function SkillsTab({ agentId }: { agentId: string }) {
  const t = useTranslations("agents");
  const skillsQ = useSkills();
  const linksQ = useAgentSkills(agentId);
  const setSkills = useSetAgentSkills(agentId);
  const [query, setQuery] = React.useState("");
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overId, setOverId] = React.useState<string | null>(null);

  if (skillsQ.isLoading || linksQ.isLoading) return <Skeleton height={200} />;
  if (skillsQ.isError || linksQ.isError) return <ErrorState body={t("skills.loadError")} />;

  const items = linksToItems(linksQ.data ?? []);
  const rows = buildRows(skillsQ.data ?? [], items);
  const visible = filterRows(rows, query);
  const filtering = query.trim().length > 0;

  const persist = (next: LinkItem[]) => setSkills.mutate(toPayload(next).items);
  const endDrag = () => {
    setDragId(null);
    setOverId(null);
  };
  const onDrop = (targetId: string) => {
    if (dragId && dragId !== targetId) persist(reorderSkill(items, dragId, targetId));
    endDrag();
  };

  return (
    <div style={s.wrap}>
      <h2 style={s.h2}>{t("skills.header", { enabled: countEffective(rows), total: rows.length })}</h2>
      <TextInput
        value={query}
        onChange={setQuery}
        placeholder={t("skills.filterPlaceholder")}
        aria-label={t("skills.filterLabel")}
      />
      <p style={s.hint}>{filtering ? t("skills.filterDragHint") : t("skills.orderHint")}</p>
      {rows.length === 0 && <p style={s.empty}>{t("skills.empty")}</p>}
      {rows.length > 0 && visible.length === 0 && <p style={s.empty}>{t("skills.noMatch", { query })}</p>}
      {visible.length > 0 && (
        <ul style={s.list}>
          {visible.map((row) => {
            const draggable = row.draggable && !filtering;
            return (
              <SkillListRow
                key={row.skill.id}
                row={row}
                draggable={draggable}
                dragging={dragId === row.skill.id}
                dropTarget={draggable && overId === row.skill.id && dragId !== row.skill.id}
                onToggle={(on) => persist(toggleSkill(items, row.skill.id, on))}
                onMove={(delta) => persist(moveSkill(items, row.skill.id, delta))}
                onDragStart={() => setDragId(row.skill.id)}
                onDragOver={() => dragId && setOverId(row.skill.id)}
                onDrop={() => onDrop(row.skill.id)}
                onDragEnd={endDrag}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SkillListRow({
  row,
  draggable,
  dragging,
  dropTarget,
  onToggle,
  onMove,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  row: SkillRow;
  draggable: boolean;
  dragging: boolean;
  dropTarget: boolean;
  onToggle: (on: boolean) => void;
  onMove: (delta: number) => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  const t = useTranslations("agents");
  const checkable = canCheck(row.skill);
  const dndProps = draggable
    ? {
        draggable: true,
        onDragStart: (e: React.DragEvent) => {
          e.dataTransfer?.setData("text/plain", row.skill.id);
          if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
          onDragStart();
        },
        onDragOver: (e: React.DragEvent) => {
          e.preventDefault();
          onDragOver();
        },
        onDrop: (e: React.DragEvent) => {
          e.preventDefault();
          onDrop();
        },
        onDragEnd,
      }
    : {};
  return (
    <li
      aria-label={row.skill.name}
      style={s.row({ dimmed: row.globallyDisabled, dragging, dropTarget })}
      title={row.globallyDisabled ? t("skills.disabledGloballyHint") : undefined}
      {...dndProps}
    >
      {draggable ? (
        <span aria-label={t("skills.dragHandle")} role="img" style={s.handle}>
          <Icon.Menu size={14} />
        </span>
      ) : (
        <span style={s.handleSpacer} />
      )}
      <span aria-disabled={!checkable || undefined} style={checkable ? undefined : s.checkboxOff}>
        <Checkbox checked={row.checked} onChange={checkable ? onToggle : undefined} />
      </span>
      <span className="mono" style={s.name}>
        {row.skill.name}
      </span>
      {row.globallyDisabled && <span style={s.offHint}>{t("skills.disabledGlobally")}</span>}
      <SkillTypeChip type={row.skill.type} />
      {draggable && (
        <span style={s.moveBtns}>
          <IconBtn icon="ArrowUp" size={24} label={t("skills.moveUp")} onClick={() => onMove(-1)} />
          <IconBtn icon="ArrowDown" size={24} label={t("skills.moveDown")} onClick={() => onMove(1)} />
        </span>
      )}
    </li>
  );
}
