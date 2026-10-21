/* BriefRefLink — one `file:line` reference from the brief (risk ref or review-focus item).
   Changed files navigate in-page through `onNavigate` (no full reload, no router.replace here);
   blast-only files open GitHub in a new tab; otherwise the reference is plain text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { briefLinkFor, truncateMiddle, type BriefLinkCtx } from "../../helpers";
import { s } from "./styles";

const MAX_LABEL = 48;

export function BriefRefLink({
  file,
  line,
  label,
  ctx,
  onNavigate,
}: {
  file: string;
  line: number | null;
  /** Display text, e.g. `src/a.ts:12-18`. Cut in the middle when long. */
  label: string;
  ctx: BriefLinkCtx;
  onNavigate: (href: string) => void;
}) {
  const t = useTranslations("brief");
  const link = briefLinkFor(file, line, ctx);
  const shown = truncateMiddle(label, MAX_LABEL);

  if (link.kind === "text") {
    return (
      <span className="mono" style={s.text} title={file}>
        {shown}
      </span>
    );
  }
  if (link.kind === "diff") {
    const aria = line ? t("openInDiff", { file, line }) : t("openFileInDiff", { file });
    return (
      <a
        className="mono"
        href={link.href}
        style={s.link}
        title={file}
        aria-label={aria}
        onClick={(e) => {
          e.preventDefault();
          onNavigate(link.href);
        }}
      >
        {shown}
      </a>
    );
  }
  return (
    <a
      className="mono"
      href={link.href}
      style={s.link}
      title={file}
      aria-label={t("openOnGithub", { file })}
      target="_blank"
      rel="noopener noreferrer"
    >
      {shown}
    </a>
  );
}
