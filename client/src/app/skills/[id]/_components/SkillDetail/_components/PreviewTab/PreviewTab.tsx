/* PreviewTab — the saved skill body rendered as markdown (req 26), as the reviewing agent receives it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import { s } from "./styles";

export function PreviewTab({ body }: { body: string }) {
  const t = useTranslations("skills");
  return (
    <div style={s.wrap}>
      <p style={s.caption}>{t("preview.caption")}</p>
      <div style={s.card}>{body.trim() ? <Markdown>{body}</Markdown> : t("preview.empty")}</div>
    </div>
  );
}
