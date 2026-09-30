/* SkillsLabView — master/detail shell of the Skills Lab, mounted by app/skills/layout.tsx so the
   list survives navigation between /skills and /skills/:id. Left: header, "+ Add Skill ▾", search,
   SkillCards. Right: the route's page (select prompt or SkillDetail). */
"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { useSkills } from "@/lib/hooks/skills";
import { filterSkills } from "@/lib/skill-helpers";
import { SkillCard } from "./_components/SkillCard";
import { CreateSkillModal } from "./_components/CreateSkillModal";
import { ImportSkillModal } from "./_components/ImportSkillModal";
import { SKELETON_ROWS } from "./constants";
import { s } from "./styles";

type ModalKind = "create" | "import" | null;

export function SkillsLabView({ children }: { children: React.ReactNode }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  const selectedId = params?.id ?? null;
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const [search, setSearch] = React.useState("");
  const [modal, setModal] = React.useState<ModalKind>(null);

  const all = skills ?? [];
  const list = filterSkills(all, search);
  const selected = all.find((sk) => sk.id === selectedId);

  const select = (id: string) => router.push(`/skills/${id}`);
  const onSaved = (skill: Skill) => {
    setModal(null);
    select(skill.id);
  };
  const onDeleted = (id: string) => {
    if (id === selectedId) router.push("/skills");
  };

  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbSkills"), href: "/skills" },
    ...(selected ? [{ label: selected.name }] : []),
  ];

  return (
    <AppShell crumb={crumb}>
      {modal === "create" && <CreateSkillModal onClose={() => setModal(null)} onCreated={onSaved} />}
      {modal === "import" && <ImportSkillModal onClose={() => setModal(null)} onImported={onSaved} />}
      <div style={s.root}>
        <aside style={s.left}>
          <div style={s.leftHeader}>
            <div style={s.titleRow}>
              <h1 style={s.h1}>{t("page.heading")}</h1>
              <Dropdown
                width={210}
                align="right"
                trigger={
                  <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                    {t("page.addSkill")}
                  </Button>
                }
                items={[
                  { label: t("page.menu.create"), icon: "Edit", onClick: () => setModal("create") },
                  { label: t("page.menu.fromFile"), icon: "Upload", onClick: () => setModal("import") },
                ]}
              />
            </div>
            <div style={s.search}>
              <Icon.Search size={13} style={s.searchIcon} />
              <input
                aria-label={t("page.searchPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("page.searchPlaceholder")}
                style={s.searchInput}
              />
            </div>
          </div>
          <div role="list" style={s.list}>
            {isLoading && (
              <div style={s.skeletons}>
                {Array.from({ length: SKELETON_ROWS }, (_, i) => (
                  <Skeleton key={i} height={96} />
                ))}
              </div>
            )}
            {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
            {!isLoading && !isError && all.length === 0 && (
              <EmptyState
                icon="Sparkles"
                title={t("page.empty.title")}
                body={t("page.empty.body")}
                cta={t("page.empty.cta")}
                onCta={() => setModal("create")}
              />
            )}
            {all.length > 0 && list.length === 0 && (
              <div style={s.noMatch}>{t("page.noMatch", { query: search.trim() })}</div>
            )}
            {list.map((sk) => (
              <SkillCard key={sk.id} skill={sk} active={sk.id === selectedId} onSelect={select} onDeleted={onDeleted} />
            ))}
          </div>
        </aside>
        <section style={s.right}>{children}</section>
      </div>
    </AppShell>
  );
}
