"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { OnboardingTour, OnboardingTourState } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { useGenerateOnboarding, useOnboardingTour } from "@/lib/hooks/onboarding";
import { useRepoIntelStatus } from "@/lib/hooks/repo-intel";
import { useRefreshRepo } from "@/lib/hooks/core";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { TOUR_SECTIONS } from "../../constants";
import { fileHref, tourToMarkdown, tourViewMode } from "../../helpers";
import { useCopyToClipboard } from "../../use-copy-to-clipboard";
import { ArchitectureSection } from "../ArchitectureSection";
import { CriticalPathsSection } from "../CriticalPathsSection";
import { FirstTasksSection } from "../FirstTasksSection";
import { NotClonedState, type CloneState } from "../NotClonedState/NotClonedState";
import { ReadingPathSection } from "../ReadingPathSection";
import { RunCommandsSection } from "../RunCommandsSection";
import { SectionCard } from "../SectionCard";
import { TourActions } from "../TourActions";
import { TourHeader } from "../TourHeader";
import { TourToc } from "../TourToc";
import { s } from "./styles";

export interface OnboardingTourViewProps {
  repoId: string;
}

interface CloneEntry {
  repoId: string;
  state: CloneState;
}

export function OnboardingTourView({ repoId }: OnboardingTourViewProps) {
  const t = useTranslations("onboarding");
  const router = useRouter();
  const { repos, activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { copy } = useCopyToClipboard();

  // Clone flow (R6). The state is tagged with its repo, so a repoId change reads as "idle".
  const [clone, setClone] = React.useState<CloneEntry>({ repoId, state: "idle" });
  const cloneState: CloneState = clone.repoId === repoId ? clone.state : "idle";

  const tourQuery = useOnboardingTour(repoId, { pollUntilCloned: cloneState === "requested" });
  if (cloneState === "requested" && tourQuery.clonePollTimedOut) {
    setClone({ repoId, state: "timed_out" });
  }

  const generate = useGenerateOnboarding(repoId);
  const refreshRepo = useRefreshRepo();

  const { data, isLoading, isError, refetch } = tourQuery;
  const mode = tourViewMode({ repoKnown: !repoNotFound, isLoading, isError, data });
  const indexState = useRepoIntelStatus(mode === "not_cloned" ? repoId : null);

  const repo = repos.find((r) => r.id === repoId) ?? (activeRepo?.id === repoId ? activeRepo : undefined);
  const repoName = repo?.name ?? repoId;
  const crumb = [{ label: repo?.full_name ?? repoId, mono: true }, { label: t("breadcrumb") }];

  const onGenerate = () => generate.mutate();
  const rateLimited = generate.data === "rate_limited";
  const onClone = () =>
    refreshRepo.mutate(repoId, {
      onSuccess: () => setClone({ repoId, state: "requested" }),
      onError: () => setClone({ repoId, state: "failed" }),
    });

  const actionsFor = (state: OnboardingTourState, actionMode: "empty" | "tour" | "generating") => (
    <TourActions
      mode={actionMode}
      state={state}
      pending={generate.isPending}
      rateLimited={rateLimited}
      onGenerate={onGenerate}
      onShare={() =>
        void copy(`${window.location.origin}/repos/${repoId}/onboarding`, t("copy.linkCopied"))
      }
      onCopyMarkdown={() => {
        if (!state.tour) return;
        const titles = Object.fromEntries(TOUR_SECTIONS.map((x) => [x.key, t(x.titleKey)]));
        const markdown = tourToMarkdown(state.tour, {
          repoName,
          titles,
          reasonLabel: (code) => t(`reasons.${code}`),
        });
        void copy(markdown, t("copy.markdownCopied"));
      }}
    />
  );

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        {mode === "no_repo" ? (
          <EmptyState
            icon="Compass"
            title={t("noRepo.title")}
            cta={t("noRepo.cta")}
            onCta={() => router.push("/onboarding")}
          />
        ) : mode === "load_error" ? (
          <ErrorState title={t("loadError.title")} onRetry={() => void refetch()} />
        ) : mode === "loading" || !data ? (
          <Skeleton height={120} />
        ) : mode === "not_cloned" ? (
          <NotClonedState indexState={indexState} onClone={onClone} pending={refreshRepo.isPending} cloneState={cloneState} />
        ) : mode === "tour" && data.tour ? (
          <TourBody
            state={data}
            tour={data.tour}
            repo={repo}
            repoName={repoName}
            actions={actionsFor(data, "tour")}
            onCopyCommand={(command) => void copy(command, t("copy.commandCopied"))}
          />
        ) : (
          <>
            <TourHeader repoName={repoName} state={data} actions={actionsFor(data, mode === "generating" ? "generating" : "empty")} />
            {mode === "generating" ? (
              TOUR_SECTIONS.map((x) => (
                <div key={x.key} data-testid="tour-placeholder">
                  <Skeleton height={96} />
                </div>
              ))
            ) : data.status === "failed" && data.last_error ? (
              <p style={s.failed}>
                {t("actions.lastFailed", { reason: t(`reasons.${data.last_error.reason}`) })}
              </p>
            ) : null}
          </>
        )}
      </div>
    </AppShell>
  );
}

interface TourBodyProps {
  state: OnboardingTourState;
  tour: OnboardingTour;
  repo: { full_name: string; default_branch: string } | undefined;
  repoName: string;
  actions: React.ReactNode;
  onCopyCommand: (command: string) => void;
}

function TourBody({ state, tour, repo, repoName, actions, onCopyCommand }: TourBodyProps) {
  const t = useTranslations("onboarding");
  const knownPaths = tour.known_paths;
  const hrefFor = (path: string) => (repo ? fileHref(repo, tour.index_sha, path) : "#");
  const titles = Object.fromEntries(TOUR_SECTIONS.map((x) => [x.key, t(x.titleKey)]));
  const { sections } = tour;

  const body: Record<(typeof TOUR_SECTIONS)[number]["key"], React.ReactNode> = {
    architecture: <ArchitectureSection section={sections.architecture} knownPaths={knownPaths} hrefFor={hrefFor} />,
    criticalPaths: <CriticalPathsSection section={sections.critical_paths} knownPaths={knownPaths} hrefFor={hrefFor} />,
    runCommands: (
      <RunCommandsSection section={sections.run_commands} knownPaths={knownPaths} hrefFor={hrefFor} onCopy={onCopyCommand} />
    ),
    readingPath: <ReadingPathSection section={sections.reading_path} knownPaths={knownPaths} hrefFor={hrefFor} />,
    firstTasks: <FirstTasksSection section={sections.first_tasks} knownPaths={knownPaths} hrefFor={hrefFor} />,
  };
  const meta = {
    architecture: sections.architecture,
    criticalPaths: sections.critical_paths,
    runCommands: sections.run_commands,
    readingPath: sections.reading_path,
    firstTasks: sections.first_tasks,
  };

  return (
    <>
      <TourHeader repoName={repoName} state={state} actions={actions} />
      <div style={s.body}>
        <TourToc titles={titles} />
        <div style={s.cards}>
          {TOUR_SECTIONS.map((x) => (
            <SectionCard
              key={x.key}
              anchor={x.anchor}
              title={titles[x.key]!}
              source={meta[x.key].source}
              unavailableReason={meta[x.key].unavailable_reason}
            >
              {meta[x.key].unavailable_reason ? null : body[x.key]}
            </SectionCard>
          ))}
        </div>
      </div>
    </>
  );
}
