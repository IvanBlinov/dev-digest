/* InjectionFindings — the findings of a skill's prompt-injection scan: `Line N · <label>` plus the
   offending excerpt in monospace. Used by the skill detail banner and the import preview warning. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { SkillInjectionFinding } from "@devdigest/shared";
import { s } from "./styles";

export function InjectionFindings({ findings }: { findings: readonly SkillInjectionFinding[] }) {
  const t = useTranslations("skills");
  return (
    <ul aria-label={t("injectionFindings.label")} style={s.list}>
      {findings.map((f, i) => (
        <li key={`${f.line}:${f.rule}:${i}`} style={s.item}>
          <div style={s.head}>{t("injectionFindings.line", { line: f.line, label: f.label })}</div>
          <code className="mono" style={s.excerpt}>
            {f.excerpt}
          </code>
        </li>
      ))}
    </ul>
  );
}
