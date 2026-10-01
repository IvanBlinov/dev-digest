/* SkillDetail — right panel of the Skills Lab on /skills/:id: header (name, type, version) and
   exactly three tabs — Config · Preview · Versioning (req 25). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, EmptyState, ErrorState, Icon, Skeleton, Tabs } from "@devdigest/ui";
import { SkillTypeChip } from "@/components/skill-type-chip";
import { ApiError } from "@/lib/api";
import { useSkill } from "@/lib/hooks/skills";
import { ConfigTab } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { VersioningTab } from "./_components/VersioningTab";
import { HTTP_NOT_FOUND, SKILL_TABS, type SkillTab } from "./constants";
import { s } from "./styles";

export function SkillDetail({ id }: { id: string }) {
  const t = useTranslations("skills");
  const { data: skill, isLoading, isError, error, refetch } = useSkill(id);
  const [tab, setTab] = React.useState<SkillTab>("config");

  if (isLoading) {
    return (
      <div style={s.loading}>
        <Skeleton height={24} width={240} />
        <Skeleton height={260} />
      </div>
    );
  }
  if ((isError && error instanceof ApiError && error.status === HTTP_NOT_FOUND) || (!isError && !skill)) {
    return <EmptyState icon="Sparkles" title={t("detail.notFound.title")} body={t("detail.notFound.body")} />;
  }
  if (isError || !skill) return <ErrorState body={t("detail.loadError")} onRetry={() => refetch()} />;

  const tabs = SKILL_TABS.map((key) => ({ key, label: t(`detail.tabs.${key}`) }));

  return (
    <div style={s.root}>
      <div style={s.header}>
        <Icon.Sparkles size={18} style={s.icon} />
        <h1 className="mono" style={s.title}>
          {skill.name}
        </h1>
        <SkillTypeChip type={skill.type} />
        <Badge mono>{t("detail.version", { version: skill.version })}</Badge>
      </div>
      <nav aria-label={t("detail.tabsLabel")}>
        <Tabs tabs={tabs} value={tab} onChange={(k) => setTab(k as SkillTab)} />
      </nav>
      <div style={s.body}>
        {/* Remount the form when the saved version changes so the draft resets to the new body. */}
        {tab === "config" && <ConfigTab key={`${skill.id}:${skill.version}`} skill={skill} />}
        {tab === "preview" && <PreviewTab body={skill.body} />}
        {tab === "versioning" && <VersioningTab skill={skill} />}
      </div>
    </div>
  );
}
