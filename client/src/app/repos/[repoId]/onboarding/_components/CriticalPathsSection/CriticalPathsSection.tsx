"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { OnboardingTour } from "@devdigest/shared";
import { TourMarkdown } from "../TourMarkdown";
import { TruncatedText } from "../TruncatedText";
import { s } from "./styles";

export interface CriticalPathsSectionProps {
  section: OnboardingTour["sections"]["critical_paths"];
  knownPaths: readonly string[];
  hrefFor: (path: string) => string;
}

export function CriticalPathsSection({ section, knownPaths, hrefFor }: CriticalPathsSectionProps) {
  const t = useTranslations("onboarding");
  return (
    <ul style={s.list}>
      {section.items.map((item) => (
        <li key={item.path} style={s.row}>
          <div style={s.main}>
            <TruncatedText text={item.path} mono />
            <span style={s.fact}>{item.fact}</span>
            {item.reason ? (
              <span style={s.reason}>
                <TourMarkdown text={item.reason} knownPaths={knownPaths} hrefFor={hrefFor} inline />
              </span>
            ) : null}
          </div>
          <a
            href={hrefFor(item.path)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("copy.openPath", { path: item.path })}
            style={s.open}
          >
            {t("copy.open")}
          </a>
        </li>
      ))}
    </ul>
  );
}
