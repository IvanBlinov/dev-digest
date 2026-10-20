"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { OnboardingTour } from "@devdigest/shared";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import { diagramToMermaid } from "../../helpers";
import { TourMarkdown } from "../TourMarkdown";
import { s } from "./styles";

export interface ArchitectureSectionProps {
  section: OnboardingTour["sections"]["architecture"];
  knownPaths: readonly string[];
  hrefFor: (path: string) => string;
}

export function ArchitectureSection({ section, knownPaths, hrefFor }: ArchitectureSectionProps) {
  const t = useTranslations("onboarding");
  return (
    <div>
      <TourMarkdown text={section.narrative} knownPaths={knownPaths} hrefFor={hrefFor} />
      {section.diagram ? (
        <div style={s.diagram}>
          <MermaidDiagram chart={diagramToMermaid(section.diagram)} />
        </div>
      ) : (
        <p style={s.missing}>
          <span>{t("empty.diagramUnavailable")}</span>
          <span>{t(`reasons.${section.unavailable_reason ?? "no_graph"}`)}</span>
        </p>
      )}
    </div>
  );
}
