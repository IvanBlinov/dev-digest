/* PRRow — one clickable row in the PR list table. Ported from screen_dashboard.jsx. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Icon, Avatar, Badge, CircularScore } from "@devdigest/ui";
import type { PrMeta } from "@/lib/types";
import { SIZE_COLOR, STATUS_META } from "../../constants";
import { relativeTime, sizeOf } from "../../helpers";
import { formatUsd } from "@/lib/format-usd";
import { prActiveFindings, totalCount, type SeverityLevel } from "@/lib/findings";
import { usePrReviews, prefetchPrReviews } from "@/lib/hooks/reviews";
import { SeverityCounters } from "@/components/severity-counters";
import { FindingsPreviewPopover } from "@/components/findings-preview-popover";
import { s } from "../../styles";

export function PRRow({ pr, repoId }: { pr: PrMeta; repoId: string }) {
  const t = useTranslations("prReview");
  const router = useRouter();
  const [h, setH] = React.useState(false);
  const st = STATUS_META[pr.status] ?? STATUS_META.needs_review!;
  const { size, lines } = sizeOf(pr);
  const reviewed = pr.score != null; // null score ⇒ PR has never been reviewed
  const qc = useQueryClient();
  const [previewOn, setPreviewOn] = React.useState(false);
  // Reviews load lazily on hover (existing endpoint, cached) — the list itself
  // only carries the counters.
  const reviews = usePrReviews(previewOn && pr.id ? pr.id : null);
  const previewFindings = React.useMemo(() => prActiveFindings(reviews.data ?? []), [reviews.data]);
  const agentName = React.useMemo(() => {
    const byReview = new Map<string, string>();
    for (const r of reviews.data ?? []) byReview.set(r.id, r.agent_name ?? "Agent");
    return byReview;
  }, [reviews.data]);
  const hrefFor = (level: SeverityLevel) => `/repos/${repoId}/pulls/${pr.number}?tab=findings&severity=${level}`;
  return (
    <div
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      onClick={() => router.push(`/repos/${repoId}/pulls/${pr.number}`)}
      style={s.row(h)}
    >
      <div style={s.rowTitleCell}>
        <Icon.GitPullRequest size={15} style={s.rowIcon(st.c)} />
        <div style={s.rowTitleWrap}>
          <div style={s.rowTitle(h)}>{pr.title}</div>
          <span className="mono" style={s.rowNumber}>
            #{pr.number}
          </span>
        </div>
      </div>
      <div style={s.authorCell}>
        <Avatar name={pr.author} size={18} />
        {pr.author}
      </div>
      <div>
        <Badge
          color={SIZE_COLOR[size]}
          bg="transparent"
          style={s.sizeBadgeBorder(SIZE_COLOR[size]!)}
        >
          {size} · {lines}
        </Badge>
      </div>
      <div style={s.scoreCell}>
        {reviewed ? (
          <CircularScore score={pr.score!} size={34} stroke={3} />
        ) : (
          <span style={s.muted}>—</span>
        )}
      </div>
      <div
        style={s.findingsCell}
        onMouseEnter={() => {
          setPreviewOn(true);
          if (pr.id) prefetchPrReviews(qc, pr.id);
        }}
      >
        {pr.findings && totalCount(pr.findings) > 0 ? (
          <FindingsPreviewPopover
            title={t("preview.pr", { count: totalCount(pr.findings) })}
            findings={previewFindings}
            loading={reviews.isLoading}
            renderPrefix={(f) => agentName.get(f.review_id) ?? null}
          >
            <SeverityCounters counts={pr.findings} hrefFor={hrefFor} onSelect={(l) => router.push(hrefFor(l))} />
          </FindingsPreviewPopover>
        ) : (
          <SeverityCounters counts={pr.findings} />
        )}
      </div>
      <div className="mono" style={s.costCell}>
        {formatUsd(pr.cost_usd)}
      </div>
      <div>
        <Badge dot color={st.c} bg="transparent">
          {t(`list.status.${st.labelKey}`)}
        </Badge>
      </div>
      <div style={s.updatedCell}>{relativeTime(pr.updated_at)}</div>
    </div>
  );
}
