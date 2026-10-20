"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { OnboardingTour } from "@devdigest/shared";
import { TourMarkdown } from "../TourMarkdown";
import { TruncatedText } from "../TruncatedText";
import { s } from "./styles";

export interface RunCommandsSectionProps {
  section: OnboardingTour["sections"]["run_commands"];
  knownPaths: readonly string[];
  hrefFor: (path: string) => string;
  onCopy: (command: string) => void;
}

export function RunCommandsSection({ section, knownPaths, hrefFor, onCopy }: RunCommandsSectionProps) {
  const t = useTranslations("onboarding");
  if (section.items.length === 0) return <p style={s.empty}>{t("empty.noCommands")}</p>;
  return (
    <ol style={s.list}>
      {section.items.map((item, i) => (
        <li key={item.id} style={s.row}>
          <span style={s.num}>{i + 1}</span>
          <div style={s.main}>
            <TruncatedText text={item.command} tooltip={item.script_body ?? undefined} mono />
            {item.comment ? (
              <span style={s.comment}>
                <TourMarkdown text={item.comment} knownPaths={knownPaths} hrefFor={hrefFor} inline />
              </span>
            ) : null}
          </div>
          <button
            type="button"
            style={s.copy}
            aria-label={t("copy.copyCommand", { command: item.command })}
            onClick={() => onCopy(item.command)}
          >
            <Icon.Copy size={14} aria-hidden="true" />
          </button>
        </li>
      ))}
    </ol>
  );
}
