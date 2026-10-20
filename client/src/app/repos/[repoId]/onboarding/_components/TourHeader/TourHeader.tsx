"use client";

import React from "react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import type { OnboardingTourState } from "@devdigest/shared";
import { formatUsd } from "@/lib/format-usd";
import { s } from "./styles";

export interface TourHeaderProps {
  repoName: string;
  state: OnboardingTourState;
  actions: React.ReactNode;
}

export function TourHeader({ repoName, state, actions }: TourHeaderProps) {
  const t = useTranslations("onboarding");
  const format = useFormatter();
  const now = useNow();
  const { tour } = state;
  const ago = (iso: string) => format.relativeTime(new Date(iso), now);

  let subtitle: string | null = null;
  let footnote: string | null = null;
  if (tour) {
    const { files_indexed, files_total, partial } = tour.coverage;
    const coverage = !partial
      ? t("subtitle.coverage", { count: files_indexed })
      : files_total != null
        ? t("subtitle.coveragePartial", { count: files_indexed, total: files_total })
        : t("subtitle.coveragePartialNoTotal", { count: files_indexed });
    subtitle = [
      coverage,
      t("subtitle.generatedAt", { when: ago(tour.generated_at) }),
      state.index_updated_at ? t("subtitle.indexAt", { when: ago(state.index_updated_at) }) : null,
    ]
      .filter(Boolean)
      .join(" · ");
    const g = tour.generation;
    footnote = t("footnote", {
      model: g.model,
      calls: g.llm_calls,
      cost: g.cost_usd == null ? t("costUnknown") : formatUsd(g.cost_usd),
    });
  }

  const showBanner = state.status === "failed" && state.last_error && tour;
  return (
    <header style={s.root}>
      <div style={s.top}>
        <h1 style={s.h1}>{t("title", { name: repoName })}</h1>
        {actions}
      </div>
      {subtitle ? <p style={s.meta}>{subtitle}</p> : null}
      {footnote ? <p style={s.meta}>{footnote}</p> : null}
      {showBanner ? (
        <div role="alert" style={s.banner}>
          {t("failedBanner", {
            when: ago(state.last_error!.at),
            reason: t(`reasons.${state.last_error!.reason}`),
            tourWhen: ago(tour.generated_at),
          })}
        </div>
      ) : null}
    </header>
  );
}
