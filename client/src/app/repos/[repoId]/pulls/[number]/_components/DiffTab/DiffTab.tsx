/* DiffTab — the "Files changed" tab. Smart order (default): files grouped by role
   (core → tests → wiring → docs → boilerplate) with the review's findings as inline
   comments under their lines. Original order: the plain DiffViewer, as GitHub lists it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button, Chip, Skeleton } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment } from "@/lib/hooks/reviews";
import { useSmartDiff } from "@/lib/hooks/smart-diff";
import { notify } from "@/lib/toast";
import type { PrFile, SmartDiffRole } from "@devdigest/shared";
import { COLLAPSED_ROLES } from "./constants";
import { filesWithFindings, joinGroups, resolveTarget, totals } from "./helpers";
import { useFindingAnnotations } from "./useFindingAnnotations";
import { SmartGroupHeader } from "./_components/SmartGroupHeader";
import { s } from "./styles";

export type DiffOrder = "smart" | "original";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
  order: DiffOrder;
  onOrderChange: (order: DiffOrder) => void;
  repoFullName?: string | null;
  headSha?: string | null;
  /** `?file=` — a changed file to open, highlight and focus. */
  targetFile?: string | null;
  /** `?line=` — a line (new side) inside `targetFile`. */
  targetLine?: number | null;
}

export function DiffTab({
  prId,
  filesCount,
  files,
  canComment,
  order,
  onOrderChange,
  repoFullName,
  headSha,
  targetFile = null,
  targetLine = null,
}: DiffTabProps) {
  const t = useTranslations("prReview.smartDiff");
  const tBrief = useTranslations("brief");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  const smart = useSmartDiff(order === "smart" ? prId : null);
  const { shown, active, reviewed, api } = useFindingAnnotations(prId, repoFullName, headSha);

  // null = follow the default (shown when the review has findings, dismissed ones
  // included so dismissing the last one doesn't make the card vanish); a click overrides.
  const [showOverride, setShowOverride] = React.useState<boolean | null>(null);
  const showComments = showOverride ?? shown.length > 0;
  // Per-role open state; absent = the role's default (docs/boilerplate collapsed).
  const [groupOpen, setGroupOpen] = React.useState<Partial<Record<SmartDiffRole, boolean>>>({});

  const toggleCount = (comments?.length ?? 0) + shown.length;

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowOverride(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  const groups = React.useMemo(
    () => (smart.data ? joinGroups(smart.data, files) : []),
    [smart.data, files],
  );
  const useSmartView = order === "smart" && !smart.isError;
  const loading = order === "smart" && smart.isLoading;
  const sums = totals(files);
  const target = React.useMemo(() => resolveTarget(files, targetFile, targetLine), [files, targetFile, targetLine]);
  const targetPath = target.path ?? null;
  const viewerTarget = { targetPath, targetLine: target.status === "ok" ? targetLine : null };
  const targetNotice =
    target.status === "not_in_diff"
      ? tBrief("fileNotInDiff")
      : target.status === "line_not_shown"
        ? tBrief("lineNotShown")
        : null;

  const toggle = (
    <div style={s.actions}>
      {toggleCount > 0 && (
        <Button
          kind="ghost"
          size="sm"
          icon={showComments ? "EyeOff" : "Eye"}
          onClick={() => setShowOverride(!showComments)}
        >
          {t(showComments ? "hideComments" : "showComments", { count: toggleCount })}
        </Button>
      )}
      <Chip active={order === "smart"} onClick={() => onOrderChange("smart")}>
        {t("smartOrder")}
      </Chip>
      <Chip active={order === "original"} onClick={() => onOrderChange("original")}>
        {t("originalOrder")}
      </Chip>
    </div>
  );

  return (
    <section>
      <SectionLabel icon="Code" right={toggle}>
        {useSmartView
          ? `${t("reviewerOrdered")} · ${t("totals", sums)}`
          : t("filesChanged", { count: filesCount })}
      </SectionLabel>

      {targetNotice && <div style={s.notice}>{targetNotice}</div>}

      {loading ? (
        <Skeleton height={160} />
      ) : useSmartView ? (
        <>
          {!reviewed && <div style={s.notice}>{t("reviewNotRun")}</div>}
          <div style={s.groups}>
            {groups.map((g) => {
              // The group holding the navigation target is open unless the user closed it.
              const holdsTarget = targetPath !== null && g.files.some((f) => f.path === targetPath);
              const open = groupOpen[g.role] ?? (holdsTarget || !COLLAPSED_ROLES.has(g.role));
              return (
                <div key={g.role} style={s.group}>
                  <SmartGroupHeader
                    role={g.role}
                    fileCount={g.files.length}
                    flaggedCount={filesWithFindings(g.files, active)}
                    reviewed={reviewed}
                    open={open}
                    onToggle={() => setGroupOpen((prev) => ({ ...prev, [g.role]: !open }))}
                  />
                  {open && (
                    <DiffViewer
                      files={g.files}
                      commenting={commenting}
                      annotations={api(showComments)}
                      {...viewerTarget}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <DiffViewer files={files} commenting={commenting} {...viewerTarget} />
      )}
    </section>
  );
}
