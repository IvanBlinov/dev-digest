"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { OnboardingTour } from "@devdigest/shared";
import { TourMarkdown } from "../TourMarkdown";
import { s } from "./styles";

export interface FirstTasksSectionProps {
  section: OnboardingTour["sections"]["first_tasks"];
  knownPaths: readonly string[];
  hrefFor: (path: string) => string;
}

export function FirstTasksSection({ section, knownPaths, hrefFor }: FirstTasksSectionProps) {
  const t = useTranslations("onboarding");
  if (section.items.length === 0) return <p style={s.empty}>{t("empty.noTasks")}</p>;
  const known = new Set(knownPaths);
  return (
    <ul style={s.list}>
      {section.items.map((task, i) => (
        <li key={`${i}-${task.title}`}>
          <div style={s.title}>{task.title}</div>
          <TourMarkdown text={task.description} knownPaths={knownPaths} hrefFor={hrefFor} />
          <div style={s.paths}>
            {task.paths.map((path) =>
              known.has(path) ? (
                <a
                  key={path}
                  href={hrefFor(path)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("copy.openPath", { path })}
                  className="mono"
                  style={s.link}
                >
                  {path}
                </a>
              ) : (
                <span key={path} className="mono">
                  {path}
                </span>
              ),
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
