"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { OnboardingTour } from "@devdigest/shared";
import { TourMarkdown } from "../TourMarkdown";
import { TruncatedText } from "../TruncatedText";
import { s } from "./styles";

export interface ReadingPathSectionProps {
  section: OnboardingTour["sections"]["reading_path"];
  knownPaths: readonly string[];
  hrefFor: (path: string) => string;
}

export function ReadingPathSection({ section, knownPaths, hrefFor }: ReadingPathSectionProps) {
  const t = useTranslations("onboarding");
  if (section.items.length === 0) {
    return section.unavailable_reason === "no_graph" ? <p style={s.empty}>{t("empty.noGraph")}</p> : null;
  }
  return (
    <ol style={s.list}>
      {section.items.map((item, i) => (
        <li key={`${i}-${item.path}`} style={s.row}>
          <span style={s.num}>{i + 1}</span>
          <div style={s.main}>
            <TruncatedText text={item.path} mono />
            <span style={s.why}>
              {item.why_source === "llm" ? (
                <TourMarkdown text={item.why} knownPaths={knownPaths} hrefFor={hrefFor} inline />
              ) : (
                item.why
              )}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}
