/* BriefSummaryCard — the PR Brief header card: summary, generate/refresh, staleness, inline
   errors, provenance ("Built from", "Missing") and cost footer. The summary is model output
   about author-controlled text: plain text only, never Markdown/HTML. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, Card, IconBtn, SectionLabel, Skeleton } from "@devdigest/ui";
import type { PrBriefResponse } from "@devdigest/shared";
import type { ApiError } from "@/lib/api";
import { formatUsd } from "@/lib/format-usd";
import { briefErrorView, builtFromLine, missingInputs } from "./helpers";
import { s } from "./styles";

const SHORT_SHA = 7;

export function BriefSummaryCard({
  response,
  loading,
  pending,
  error,
  onGenerate,
}: {
  response: PrBriefResponse | undefined;
  loading: boolean;
  pending: boolean;
  error: ApiError | null;
  onGenerate: () => void;
}) {
  const t = useTranslations("brief");
  const brief = response?.brief ?? null;
  const errView = error ? briefErrorView(error) : null;
  const noFiles = errView?.kind === "noFiles";

  const errorText = (() => {
    if (!errView) return null;
    switch (errView.kind) {
      case "rateLimited":
        return t("errors.rateLimited", { seconds: errView.seconds });
      case "inProgress":
        return t("errors.inProgress");
      case "noFiles":
        return t("noFiles");
      case "config":
        return t("errors.config");
      default:
        return t("errors.generic");
    }
  })();

  const errorBanner = errView && errorText && (
    <div role="alert" style={s.banner("crit")}>
      <span>{errorText}</span>
      {errView.kind === "config" && (
        <Link href="/settings/models" style={s.link}>
          {t("errors.configLink")}
        </Link>
      )}
      {(errView.kind === "generic" || errView.kind === "rateLimited") && (
        <Button kind="secondary" size="sm" disabled={pending} onClick={onGenerate}>
          {t("retry")}
        </Button>
      )}
    </div>
  );

  if (loading) {
    return (
      <Card>
        <SectionLabel icon="Sparkles">{t("sectionLabel")}</SectionLabel>
        <div style={s.skeletons}>
          <Skeleton height={16} />
          <Skeleton height={16} width="80%" />
        </div>
      </Card>
    );
  }

  if (!brief) {
    return (
      <Card>
        <SectionLabel icon="Sparkles">{t("sectionLabel")}</SectionLabel>
        {errorBanner}
        {pending ? (
          <div style={s.skeletons}>
            <Skeleton height={16} />
            <Skeleton height={16} width="80%" />
          </div>
        ) : (
          <p style={s.hint}>{t("unavailableHint")}</p>
        )}
        <div style={{ ...s.empty, marginTop: 12 }}>
          <Button
            kind="primary"
            icon="Sparkles"
            disabled={pending || noFiles}
            aria-busy={pending ? true : undefined}
            onClick={onGenerate}
          >
            {pending ? t("generating") : t("generate")}
          </Button>
        </div>
      </Card>
    );
  }

  const missing = missingInputs(brief.inputs);
  const builtFrom = builtFromLine(brief.inputs, {
    kind: (k) => t(`inputKind.${k}`),
    filesShown: (shown, total) => t("filesShown", { shown, total }),
    blastDegraded: (reason) => t("blastDegraded", { reason }),
  });
  const dropped = brief.dropped.risks + brief.dropped.review_focus;
  const staleReason = response?.stale ? response.stale_reason : null;

  return (
    <Card>
      <SectionLabel
        icon="Sparkles"
        right={<IconBtn icon="RefreshCw" label={t("refresh")} disabled={pending} busy={pending} onClick={onGenerate} />}
      >
        {t("sectionLabel")}
      </SectionLabel>
      {staleReason && (
        <div role="status" style={s.banner("warn")}>
          <span>{t(`stale.${staleReason}`)}</span>
          <Button kind="secondary" size="sm" disabled={pending} onClick={onGenerate}>
            {t("regenerate")}
          </Button>
        </div>
      )}
      {errorBanner}
      {pending ? (
        <div style={s.skeletons}>
          <Skeleton height={16} />
          <Skeleton height={16} />
          <Skeleton height={16} width="60%" />
        </div>
      ) : (
        <p style={s.summary}>{brief.summary}</p>
      )}
      <div style={s.meta}>
        {missing.length > 0 && (
          <div>{t("missing", { list: missing.map((i) => t(`inputKind.${i.kind}`)).join(", ") })}</div>
        )}
        {builtFrom.length > 0 && <div>{t("builtFrom", { list: builtFrom.join(", ") })}</div>}
        {dropped > 0 && <div>{t("dropped", { count: dropped })}</div>}
        <div style={s.footer}>
          {t("footer", {
            cost: formatUsd(brief.cost_usd),
            tokensIn: String(brief.tokens_in),
            tokensOut: String(brief.tokens_out),
            model: brief.model,
            when: new Date(brief.generated_at).toLocaleString(),
            sha: brief.head_sha.slice(0, SHORT_SHA),
          })}
        </div>
      </div>
    </Card>
  );
}
