"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { indexStatusKey, type IndexStateInput } from "./helpers";
import { s } from "./styles";

export type CloneState = "idle" | "requested" | "timed_out" | "failed";

export interface NotClonedStateProps {
  indexState: IndexStateInput;
  onClone: () => void;
  pending: boolean;
  cloneState: CloneState;
}

export function NotClonedState({ indexState, onClone, pending, cloneState }: NotClonedStateProps) {
  const t = useTranslations("onboarding");
  return (
    <div style={s.root}>
      <h2 style={s.title}>{t("notCloned.title")}</h2>
      <p style={s.meta}>{t("notCloned.index", { status: t(`indexStatus.${indexStatusKey(indexState)}`) })}</p>
      <Button kind="primary" disabled={pending || cloneState === "requested"} onClick={onClone}>
        {t("notCloned.cta")}
      </Button>
      {cloneState === "requested" ? <p style={s.meta}>{t("notCloned.requested")}</p> : null}
      {cloneState === "timed_out" ? <p style={s.meta}>{t("notCloned.stillCloning")}</p> : null}
      {cloneState === "failed" ? (
        <p role="alert" style={s.alert}>
          {t("notCloned.failed")}
        </p>
      ) : null}
    </div>
  );
}
