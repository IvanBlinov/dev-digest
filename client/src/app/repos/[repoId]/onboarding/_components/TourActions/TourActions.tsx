"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button } from "@devdigest/ui";
import type { OnboardingTourState } from "@devdigest/shared";
import { s } from "./styles";

export interface TourActionsProps {
  mode: "empty" | "tour" | "generating";
  state: OnboardingTourState;
  pending: boolean;
  rateLimited: boolean;
  onGenerate: () => void;
  onShare: () => void;
  onCopyMarkdown: () => void;
}

export function TourActions({
  mode,
  state,
  pending,
  rateLimited,
  onGenerate,
  onShare,
  onCopyMarkdown,
}: TourActionsProps) {
  const t = useTranslations("onboarding");
  const busy = mode === "generating" || pending;
  const generateLabel = busy
    ? t("actions.generating")
    : mode === "empty"
      ? t("actions.generate")
      : t("actions.regenerate");
  const needsClone = mode === "tour" && !state.cloned;

  return (
    <div style={s.group}>
      {mode === "tour" && state.stale ? (
        <>
          <Badge>{t("stale.badge")}</Badge>
          {state.stale_reason ? <span style={s.note}>{t(`stale.${state.stale_reason}`)}</span> : null}
        </>
      ) : null}
      <Button kind={mode === "empty" ? "primary" : "secondary"} disabled={busy || needsClone} onClick={onGenerate}>
        {generateLabel}
      </Button>
      {mode === "empty" && !busy ? <span style={s.note}>{t("actions.generateNote")}</span> : null}
      {needsClone ? <span style={s.note}>{t("actions.cloneToRegenerate")}</span> : null}
      {mode === "tour" ? (
        <>
          <Button kind="ghost" onClick={onShare}>
            {t("actions.share")}
          </Button>
          <Button kind="ghost" onClick={onCopyMarkdown}>
            {t("actions.copyMarkdown")}
          </Button>
        </>
      ) : null}
      {rateLimited ? (
        <span role="alert" style={s.alert}>
          {t("actions.rateLimited")}
        </span>
      ) : null}
    </div>
  );
}
