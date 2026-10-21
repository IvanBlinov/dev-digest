/* ReviewFocus — "read these first": model-picked file:line + reason. The reason is model
   output about author-controlled text, so it is rendered as plain text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Card, SectionLabel, Skeleton } from "@devdigest/ui";
import type { ReviewFocusItem } from "@devdigest/shared";
import type { BriefLinkCtx } from "../../helpers";
import { BriefRefLink } from "../BriefRefLink";
import { s } from "./styles";

export function ReviewFocus({
  items,
  pending,
  linkCtx,
  onNavigate,
}: {
  items: ReviewFocusItem[] | null;
  pending: boolean;
  linkCtx: BriefLinkCtx;
  onNavigate: (href: string) => void;
}) {
  const t = useTranslations("brief");
  let body: React.ReactNode;
  if (pending) {
    body = (
      <div style={s.skeletons}>
        <Skeleton height={18} />
        <Skeleton height={18} />
        <Skeleton height={18} width="70%" />
      </div>
    );
  } else if (!items || items.length === 0) {
    body = <div style={s.muted}>{t("noFocus")}</div>;
  } else {
    body = (
      <ul style={s.list}>
        {items.map((it, i) => (
          <li key={`${i}-${it.file}-${it.line}`} style={s.item}>
            <span aria-hidden style={s.bullet}>
              •
            </span>
            <span>
              <BriefRefLink file={it.file} line={it.line} label={`${it.file}:${it.line}`} ctx={linkCtx} onNavigate={onNavigate} />
              <span style={s.reason}> — {it.reason}</span>
            </span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <Card>
      <section aria-label={t("reviewFocus")}>
        <SectionLabel icon="Target" right={!pending && items ? <Badge>{items.length}</Badge> : undefined}>
          {t("reviewFocus")}
        </SectionLabel>
        {body}
      </section>
    </Card>
  );
}
