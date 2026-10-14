/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count) and, when open, its parsed lines plus any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile } from "@/lib/types";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import { parsePatch, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
  cs,
} from "../comments";
import { annotationsForLine, markerForLine, partitionAnnotations, type DiffAnnotationApi, type LineAnnotation } from "../annotations";
import { s, chevronFor } from "../styles";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

export function FileCard({
  file,
  commenting,
  annotations,
  defaultOpen,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  annotations?: DiffAnnotationApi;
  /** Overrides the size-based auto-expand rule. */
  defaultOpen?: boolean;
}) {
  const t = useTranslations("shell");
  const [open, setOpen] = React.useState(
    defaultOpen ?? (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES
  );
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, lines]);

  // Same split for line annotations (e.g. findings): anchored vs outside the patch.
  const annotationItems = annotations?.items;
  const { matchedAnnotations, outsideAnnotations } = React.useMemo(() => {
    const mine = (annotationItems ?? []).filter((a) => a.path === file.path);
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    const { matched: m, outside } = partitionAnnotations(mine, renderedKeys);
    return { matchedAnnotations: m, outsideAnnotations: outside };
  }, [annotationItems, file.path, lines]);
  const showAnnotations = !!annotations?.visible;
  const flagged = !!annotations?.flaggedPaths.has(file.path);

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  return (
    <div style={s.fileCard}>
      <div onClick={() => setOpen((o) => !o)} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {flagged && annotations && (
          <span role="img" aria-label={annotations.flagLabel} style={s.flagDot} />
        )}
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
      </div>
      {open && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => (
              <CodeLine
                key={i}
                ln={ln}
                path={file.path}
                threads={threadsForLine(ln, matched)}
                commenting={commenting}
                marker={markerForLine(ln, matchedAnnotations)}
                annotationNodes={
                  showAnnotations
                    ? annotationsForLine(ln, matchedAnnotations).map((a) => (
                        <React.Fragment key={a.id}>{a.node}</React.Fragment>
                      ))
                    : undefined
                }
              />
            ))
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
          {showAnnotations && annotations && outsideAnnotations.length > 0 && (
            <OutsideAnnotations title={annotations.outsideTitle} items={outsideAnnotations} />
          )}
        </div>
      )}
    </div>
  );
}

/** Annotations whose line is not part of this file's patch — never dropped silently. */
function OutsideAnnotations({ title, items }: { title: string; items: LineAnnotation[] }) {
  return (
    <div style={cs.outdatedWrap}>
      <span style={cs.outdatedTitle}>{title}</span>
      {items.map((a) => (
        <React.Fragment key={a.id}>{a.node}</React.Fragment>
      ))}
    </div>
  );
}
