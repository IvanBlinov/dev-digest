"use client";

import React, { useId, useState } from "react";
import { useTranslations } from "next-intl";
import type { OnboardingReason } from "@devdigest/shared";
import { s } from "./styles";

export interface SectionCardProps {
  anchor: string;
  title: string;
  source: "llm" | "deterministic";
  unavailableReason: OnboardingReason | null;
  children?: React.ReactNode;
}

/** Collapsible card for one tour section. Collapse state is local and resets on remount (AC-56). */
export function SectionCard({ anchor, title, source, unavailableReason, children }: SectionCardProps) {
  const t = useTranslations("onboarding");
  const [open, setOpen] = useState(true);
  const uid = useId();
  const headingId = `${uid}-h`;
  const bodyId = `${uid}-b`;
  return (
    <section id={anchor} aria-labelledby={headingId} style={s.card}>
      <div style={s.head}>
        <h2 id={headingId} style={s.title}>
          {title}
        </h2>
        {source === "deterministic" ? <span style={s.chip}>{t("card.deterministic")}</span> : null}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={open ? t("card.collapse", { title }) : t("card.expand", { title })}
          onClick={() => setOpen((v) => !v)}
          style={s.toggle}
        >
          <span aria-hidden="true">{open ? "−" : "+"}</span>
        </button>
      </div>
      {unavailableReason ? (
        <p style={s.unavailable}>{t("card.unavailable", { reason: t(`reasons.${unavailableReason}`) })}</p>
      ) : null}
      <div id={bodyId} hidden={!open} style={s.body}>
        {open ? children : null}
      </div>
    </section>
  );
}
