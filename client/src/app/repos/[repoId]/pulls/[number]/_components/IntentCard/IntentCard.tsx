/* IntentCard — what the PR is trying to do (L03 Intent Layer), shown above the
   review results. Plain text only: the summary and scope items are model output
   derived from author-controlled text, so nothing here is rendered as Markdown. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Card, ErrorState, SectionLabel, Skeleton } from "@devdigest/ui";
import type { PrIntentRecord } from "@devdigest/shared";
import { useDetectIntent, usePrIntent } from "@/lib/hooks/intent";
import { confidenceTone, statusColor } from "./helpers";
import { s } from "./styles";

function ScopeColumn({ title, items, none }: { title: string; items: string[]; none: string }) {
  return (
    <section aria-label={title}>
      <div style={s.colTitle}>{title}</div>
      {items.length > 0 ? (
        <ul style={s.list}>
          {items.map((item, i) => (
            <li key={`${i}-${item}`}>{item}</li>
          ))}
        </ul>
      ) : (
        <div style={s.muted}>{none}</div>
      )}
    </section>
  );
}

function IntentBody({ intent, onDetect, pending }: { intent: PrIntentRecord; onDetect: () => void; pending: boolean }) {
  const t = useTranslations("prReview.intent");
  const tone = confidenceTone(intent.confidence);
  return (
    <>
      <SectionLabel
        icon="Target"
        right={
          <Button kind="secondary" size="sm" icon="RefreshCw" disabled={pending} onClick={onDetect}>
            {pending ? t("detecting") : t("redetect")}
          </Button>
        }
      >
        <span style={s.headerRow}>
          {t("title")}
          <Badge color={tone.color} bg={tone.bg}>
            {t(`confidence.${intent.confidence}`)}
          </Badge>
          {intent.stale && intent.stale_reason && (
            <Badge color="var(--warn)" bg="var(--warn-bg)" icon="Clock">
              {t("stale.badge")}
            </Badge>
          )}
        </span>
      </SectionLabel>

      {intent.stale && intent.stale_reason && <p style={s.hint}>{t(`stale.${intent.stale_reason}`)}</p>}
      <blockquote style={s.summary}>“{intent.summary}”</blockquote>

      <div style={s.columns}>
        <ScopeColumn title={t("inScope")} items={intent.in_scope} none={t("none")} />
        <ScopeColumn title={t("outOfScope")} items={intent.out_of_scope} none={t("none")} />
      </div>

      {intent.sources.length > 0 && (
        <div style={s.sources} aria-label={t("sources")}>
          {intent.sources.map((src, i) => (
            <Badge key={`${i}-${src.kind}-${src.ref}`} color={statusColor(src.status)} mono>
              <span>
                {t(`sourceKind.${src.kind}`)} {src.ref}
              </span>
              {src.status !== "ok" && <span>{t(`sourceStatus.${src.status}`)}</span>}
              {src.truncated && <span>{t("sourceTruncated")}</span>}
            </Badge>
          ))}
        </div>
      )}

      {intent.missing_context.length > 0 && (
        <div role="note" aria-label={t("missingContext")} style={s.missing}>
          <strong>{t("missingContext")}</strong>
          <ul style={s.missingList}>
            {intent.missing_context.map((m, i) => (
              <li key={`${i}-${m}`}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      {intent.confidence === "low" && <p style={s.hint}>{t("lowConfidenceHint")}</p>}
    </>
  );
}

export function IntentCard({ prId }: { prId: string | null }) {
  const t = useTranslations("prReview.intent");
  const { data, isLoading, isError, refetch } = usePrIntent(prId);
  const detect = useDetectIntent(prId);
  const onDetect = () => detect.mutate();

  if (isLoading) {
    return (
      <Card>
        <div role="status" aria-label={t("loading")} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Skeleton height={14} width={140} />
          <Skeleton height={18} width="80%" />
          <Skeleton height={48} />
        </div>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <ErrorState title={t("error")} onRetry={() => refetch()} />
      </Card>
    );
  }

  const intent = data?.intent ?? null;
  return (
    <Card>
      {intent ? (
        <IntentBody intent={intent} onDetect={onDetect} pending={detect.isPending} />
      ) : (
        <>
          <SectionLabel icon="Target">{t("title")}</SectionLabel>
          <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>{t("empty")}</h3>
          <p style={s.empty}>{t("emptyBody")}</p>
          <Button kind="primary" size="sm" icon="Zap" loading={detect.isPending} disabled={detect.isPending} onClick={onDetect}>
            {detect.isPending ? t("detecting") : t("detect")}
          </Button>
        </>
      )}
    </Card>
  );
}
