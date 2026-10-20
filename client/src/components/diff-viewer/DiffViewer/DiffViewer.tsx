/* DiffViewer — basic GitHub-style unified diff viewer. Renders real PrFile.patch
   (unified-diff text from the F1 API) as a list of collapsible FileCards.
   Optional inline comments (Files changed tab): hover a line → "+" → comment,
   posted live to GitHub; existing GitHub review comments render inline. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { PrFile } from "@/lib/types";
import { type DiffCommentApi } from "../comments";
import type { DiffAnnotationApi } from "../annotations";
import { s } from "../styles";
import { FileCard } from "../FileCard";

export function DiffViewer({
  files,
  commenting,
  annotations,
  defaultOpen,
  targetPath,
  targetLine,
}: {
  files: PrFile[];
  commenting?: DiffCommentApi;
  annotations?: DiffAnnotationApi;
  /** Overrides the size-based auto-expand rule for every card. */
  defaultOpen?: boolean;
  /** Navigation target: the card for this path is opened, highlighted and focused. */
  targetPath?: string | null;
  /** Line (new side) to highlight inside the targeted card. */
  targetLine?: number | null;
}) {
  const t = useTranslations("shell");
  if (!files || files.length === 0) {
    return <div style={s.empty}>{t("diffViewer.noChangedFiles")}</div>;
  }
  return (
    <div style={s.list}>
      {files.map((f, i) => (
        <FileCard
          key={i}
          file={f}
          commenting={commenting}
          annotations={annotations}
          defaultOpen={defaultOpen}
          target={targetPath != null && f.path === targetPath ? { line: targetLine ?? null } : undefined}
        />
      ))}
    </div>
  );
}
