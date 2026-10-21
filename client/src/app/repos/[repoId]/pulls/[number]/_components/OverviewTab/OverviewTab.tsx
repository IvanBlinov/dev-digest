"use client";

import React from "react";
import { Card, Markdown, SectionLabel } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { usePrBrief, useGenerateBrief } from "@/lib/hooks/brief";
import { VerdictBanner } from "../VerdictBanner";
import { BlastRadiusBlock } from "./_components/BlastRadiusBlock";
import { BriefSummaryCard } from "./_components/BriefSummaryCard";
import { RiskAreas } from "./_components/RiskAreas";
import { ReviewFocus } from "./_components/ReviewFocus";
import type { LatestReview } from "./helpers";
import { s } from "./styles";

interface OverviewTabProps {
  prBody: string | null | undefined;
  prId: string | null;
  repoId: string | null;
  repoFullName: string | null;
  headSha: string | null;
  /** Paths of the files changed in this PR: brief references to them open Files changed. */
  changedFiles: string[];
  latestReview: LatestReview | null;
  /** In-page navigation to a `?tab=diff&file=…` href (the page owns the router). */
  onNavigate: (href: string) => void;
  /** The PR intent card; rendered in the left column above the risk areas. */
  intentSlot?: React.ReactNode;
}

export function OverviewTab({
  prBody,
  prId,
  repoId,
  repoFullName,
  headSha,
  changedFiles,
  latestReview,
  onNavigate,
  intentSlot,
}: OverviewTabProps) {
  const brief = usePrBrief(prId);
  const generate = useGenerateBrief(prId);
  const changedSet = React.useMemo(() => new Set(changedFiles), [changedFiles]);
  const linkCtx = { changedFiles: changedSet, repoFullName, headSha };
  const stored = brief.data?.brief ?? null;
  const error = generate.error instanceof ApiError ? generate.error : generate.error ? new ApiError(generate.error.message, 0) : null;

  return (
    <>
      {latestReview && (
        <VerdictBanner
          verdict={latestReview.verdict}
          summary={latestReview.summary}
          score={latestReview.score}
          findingsCount={latestReview.findingsCount}
          blockers={latestReview.blockers}
          agentName={latestReview.agentName}
        />
      )}
      <BriefSummaryCard
        response={brief.data}
        loading={brief.isLoading}
        pending={generate.isPending}
        error={error}
        onGenerate={() => generate.mutate()}
      />
      <div style={s.twoCol}>
        <div style={s.leftCol}>
          {intentSlot}
          <Card>
            <RiskAreas
              risks={stored ? stored.risks : null}
              pending={generate.isPending}
              linkCtx={linkCtx}
              onNavigate={onNavigate}
            />
          </Card>
        </div>
        <BlastRadiusBlock prId={prId} repoId={repoId} repoFullName={repoFullName} headSha={headSha} />
      </div>
      <ReviewFocus
        items={stored ? stored.review_focus : null}
        pending={generate.isPending}
        linkCtx={linkCtx}
        onNavigate={onNavigate}
      />
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          {/* Author-controlled text: raw HTML is skipped and javascript: links are dropped. */}
          <div style={s.descriptionBox}>
            <Markdown skipHtml>{prBody}</Markdown>
          </div>
        </section>
      )}
    </>
  );
}
