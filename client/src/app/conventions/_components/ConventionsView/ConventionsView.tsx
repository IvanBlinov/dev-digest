/* ConventionsView — Skills Lab → Conventions (L03) for the active repo: scan (Run Scan / ReScan,
   polling while running), review candidates (accept / reject / inline edit), and turn the accepted
   ones into a skill through CreateConventionSkillModal. */
"use client";

import React from "react";
import Link from "next/link";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { ConventionScan, ConventionsState, CreateConventionSkillResult } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { useActiveRepo } from "@/lib/repo-context";
import { useConventions, useDeselectConventions, useExtractConventions } from "@/lib/hooks/conventions";
import { CandidateCard } from "./_components/CandidateCard";
import { ConventionsToolbar } from "./_components/ConventionsToolbar";
import { CreateConventionSkillModal } from "./_components/CreateConventionSkillModal";
import { SKELETON_CARDS, SKELETON_HEIGHT } from "./constants";
import { acceptedIds, scanButtonMode } from "./helpers";
import { s } from "./styles";

const NOW_REFRESH_MS = 60_000;

export function ConventionsView() {
  const t = useTranslations("conventions");
  const { repoId, activeRepo, reposLoaded } = useActiveRepo();
  const query = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const deselect = useDeselectConventions(repoId);
  const [modalIds, setModalIds] = React.useState<string[] | null>(null);
  const [created, setCreated] = React.useState<CreateConventionSkillResult | null>(null);

  const data = query.data;
  const repoName = data?.repo_name ?? activeRepo?.full_name ?? "";
  const candidates = data?.candidates ?? [];
  const accepted = acceptedIds(candidates);
  const mode = scanButtonMode(data, extract.isPending);

  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions"), href: "/conventions" }];

  if (reposLoaded && !activeRepo) {
    return (
      <AppShell crumb={crumb}>
        <EmptyState icon="ListChecks" title={t("page.noRepo.title")} body={t("page.noRepo.body")} />
      </AppShell>
    );
  }

  // Errors (409 already running, 422 not indexed, network) are toasted by the global MutationCache.
  const startScan = () => extract.mutate(undefined, { onSuccess: () => setCreated(null) });
  const deselectAll = () => deselect.mutate(accepted);
  const onCreated = (res: CreateConventionSkillResult) => {
    setModalIds(null);
    setCreated(res);
  };

  return (
    <AppShell crumb={crumb}>
      {modalIds && repoId && (
        <CreateConventionSkillModal
          repoId={repoId}
          repoName={repoName}
          candidateIds={modalIds}
          onClose={() => setModalIds(null)}
          onCreated={onCreated}
        />
      )}
      <div style={s.root}>
        <header style={s.header}>
          <div style={s.titleBlock}>
            <h1 style={s.h1}>
              {t("page.headingPrefix")}
              <span className="mono" style={s.repo}>
                {repoName}
              </span>
            </h1>
            <Subtitle state={data} />
          </div>
          <ScanButton mode={mode} disabled={!data || !data.indexed} onClick={startScan} />
        </header>

        {data?.scan?.status === "failed" && (
          <div role="alert" style={s.notice("crit")}>
            <Icon.AlertOctagon size={15} style={{ ...s.noticeIcon, color: "var(--crit)" }} />
            <span>
              {t("page.scanFailed", { error: data.scan.error ?? "" })} {t("page.scanFailedRetry")}
            </span>
          </div>
        )}
        {created && (
          <div role="status" style={s.notice("info")}>
            <Icon.CheckCircle size={15} style={{ ...s.noticeIcon, color: "var(--ok)" }} />
            <span>{t("page.created", { name: created.skill.name })}</span>
            <Link href={`/skills/${created.skill.id}`} style={s.noticeLink}>
              {t("page.openSkill")}
            </Link>
          </div>
        )}

        <Body
          query={query}
          onDeselectAll={deselectAll}
          deselecting={deselect.isPending}
          onCreateSkill={() => setModalIds(accepted)}
          acceptedCount={accepted.length}
          repoId={repoId}
        />
      </div>
    </AppShell>
  );
}

function ScanButton({ mode, disabled, onClick }: { mode: ReturnType<typeof scanButtonMode>; disabled: boolean; onClick: () => void }) {
  const t = useTranslations("conventions");
  if (mode === "scanning") {
    return (
      <Button kind="secondary" icon="RefreshCw" disabled>
        {t("page.scanning")}
      </Button>
    );
  }
  return mode === "run" ? (
    <Button kind="primary" icon="Play" onClick={onClick} disabled={disabled}>
      {t("page.runScan")}
    </Button>
  ) : (
    <Button kind="secondary" icon="RefreshCw" onClick={onClick} disabled={disabled}>
      {t("page.rescan")}
    </Button>
  );
}

function Subtitle({ state }: { state: ConventionsState | undefined }) {
  const t = useTranslations("conventions");
  const format = useFormatter();
  const now = useNow({ updateInterval: NOW_REFRESH_MS });
  const scan: ConventionScan | null | undefined = state?.scan;
  let text: string;
  if (!scan) text = t("page.subtitleIntro");
  else if (scan.status === "running") text = t("page.subtitleRunning");
  else
    text = t("page.subtitle", {
      count: scan.sample_files.length,
      when: format.relativeTime(new Date(scan.finished_at ?? scan.started_at), now),
    });
  return <div style={s.subtitle}>{text}</div>;
}

interface BodyProps {
  query: ReturnType<typeof useConventions>;
  repoId: string | null;
  acceptedCount: number;
  deselecting: boolean;
  onDeselectAll: () => void;
  onCreateSkill: () => void;
}

function Body({ query, repoId, acceptedCount, deselecting, onDeselectAll, onCreateSkill }: BodyProps) {
  const t = useTranslations("conventions");
  const data = query.data;

  if (query.isError) return <ErrorState body={t("page.loadError")} onRetry={() => void query.refetch()} />;
  if (!data || !repoId) {
    return (
      <div style={s.skeletons}>
        {Array.from({ length: SKELETON_CARDS }, (_, i) => (
          <Skeleton key={i} height={SKELETON_HEIGHT} />
        ))}
      </div>
    );
  }
  if (!data.indexed && data.candidates.length === 0) {
    return <EmptyState icon="Database" title={t("page.notIndexed.title")} body={t("page.notIndexed.body")} />;
  }
  if (data.candidates.length === 0) {
    if (data.scan?.status === "running") {
      return <EmptyState icon="RefreshCw" title={t("page.running.title")} body={t("page.running.body")} />;
    }
    if (!data.scan) return <EmptyState icon="ListChecks" title={t("page.empty.title")} body={t("page.empty.body")} />;
    if (data.scan.status === "failed") return null;
    return <EmptyState icon="ListChecks" title={t("page.noCandidates.title")} body={t("page.noCandidates.body")} />;
  }

  return (
    <>
      <ConventionsToolbar
        accepted={acceptedCount}
        total={data.candidates.length}
        onDeselectAll={onDeselectAll}
        onCreateSkill={onCreateSkill}
        deselecting={deselecting}
      />
      <div style={s.list}>
        {data.candidates.map((c) => (
          <CandidateCard key={c.id} repoId={repoId} candidate={c} />
        ))}
      </div>
    </>
  );
}
