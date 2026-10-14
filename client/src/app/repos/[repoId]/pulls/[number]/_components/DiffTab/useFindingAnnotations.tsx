/* useFindingAnnotations — turns the PR's reviews into diff-viewer line annotations.
   Counts/flags derive from usePrReviews (latest review per agent, dismissed excluded)
   so Accept/Dismiss updates instantly; dismissed findings stay visible but muted. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SEV, type Severity } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import type { DiffAnnotationApi, LineAnnotation } from "@/components/diff-viewer";
import { usePrReviews, useFindingAction } from "@/lib/hooks/reviews";
import { activeFindings, latestPerAgent } from "@/lib/findings";
import { FindingCard } from "../FindingCard";
import { findingKey, lineLabelKey } from "./helpers";

export interface FindingAnnotations {
  /** Findings of the newest review per agent, dismissed ones included (shown muted). */
  shown: FindingRecord[];
  /** Non-dismissed subset: drives dots, counters and bars. */
  active: FindingRecord[];
  reviewed: boolean;
  api: (visible: boolean) => DiffAnnotationApi;
}

export function useFindingAnnotations(
  prId: string | null,
  repoFullName: string | null | undefined,
  headSha: string | null | undefined,
): FindingAnnotations {
  const t = useTranslations("prReview.smartDiff");
  const { data: reviews } = usePrReviews(prId);
  const { mutate, isPending } = useFindingAction();

  const { shown, active, reviewed } = React.useMemo(() => {
    const all = reviews ?? [];
    const latest = latestPerAgent(all).flatMap((r) => r.findings);
    return { shown: latest, active: activeFindings(latest), reviewed: all.some((r) => r.kind === "review") };
  }, [reviews]);

  const items = React.useMemo<LineAnnotation[]>(
    () =>
      shown.map((f) => {
        const labelKey = lineLabelKey(f.severity);
        const sev = SEV[f.severity as Severity];
        return {
          id: f.id,
          path: f.file,
          key: findingKey(f),
          marker: f.dismissed_at || !labelKey || !sev ? null : { color: sev.c, label: t(`lineLabel.${labelKey}`) },
          node: (
            <FindingCard
              f={f}
              defaultExpanded
              pending={isPending}
              repoFullName={repoFullName}
              headSha={headSha}
              onAction={(act) => mutate({ findingId: f.id, action: act, prId: prId ?? undefined })}
            />
          ),
        };
      }),
    [shown, t, mutate, isPending, repoFullName, headSha, prId],
  );

  const flaggedPaths = React.useMemo(() => new Set(active.map((f) => f.file)), [active]);

  const api = (visible: boolean): DiffAnnotationApi => ({
    items,
    visible,
    flaggedPaths,
    flagLabel: t("fileHasFindings"),
    outsideTitle: t("outsideDiff"),
  });

  return { shown, active, reviewed, api };
}
