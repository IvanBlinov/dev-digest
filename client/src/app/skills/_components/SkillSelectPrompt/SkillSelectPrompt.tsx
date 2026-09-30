/* SkillSelectPrompt — right panel of /skills when no skill is selected. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";

export function SkillSelectPrompt() {
  const t = useTranslations("skills");
  return <EmptyState icon="Sparkles" title={t("page.selectPrompt.title")} body={t("page.selectPrompt.body")} />;
}
