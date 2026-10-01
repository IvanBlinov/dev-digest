/* ImportPreview — the parsed-core preview shared by the file and URL import modals: injection
   warning, editable name/description/type, source, rendered body, ignored files and warnings. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, Icon, Markdown } from "@devdigest/ui";
import type { SkillImportPreview } from "@devdigest/shared";
import { isSkillBlocked, type SkillMeta } from "@/lib/skill-helpers";
import { SkillFields } from "@/app/skills/_components/SkillFields";
import { InjectionFindings } from "@/app/skills/_components/InjectionFindings";
import { s } from "./styles";

export interface ImportPreviewProps {
  preview: SkillImportPreview;
  meta: SkillMeta;
  onMetaChange: (next: SkillMeta) => void;
  /** Translated inline error under the name, or null. */
  nameError: string | null;
  /** Translated label for the origin row ("Source file", "Source"). */
  sourceLabel: string;
  sourceValue: string;
}

export function ImportPreview({ preview, meta, onMetaChange, nameError, sourceLabel, sourceValue }: ImportPreviewProps) {
  const t = useTranslations("skills");
  return (
    <>
      <div style={s.divider} />
      {isSkillBlocked(preview.security) && (
        <section aria-label={t("import.injection.title")} style={s.injection}>
          <div style={s.injectionTitle}>
            <Icon.AlertTriangle size={15} />
            {t("import.injection.title")}
          </div>
          <p style={s.injectionBody}>{t("import.injection.body")}</p>
          <InjectionFindings findings={preview.security?.findings ?? []} />
        </section>
      )}
      <SkillFields value={meta} onChange={onMetaChange} nameError={nameError} />
      <FormField label={sourceLabel}>
        <span className="mono" style={s.source}>
          {sourceValue}
        </span>
      </FormField>
      <FormField label={t("import.bodyPreview")}>
        <div style={s.previewBox}>
          <Markdown>{preview.body}</Markdown>
        </div>
      </FormField>
      {preview.ignored_files.length > 0 && (
        <FormField label={t("import.ignoredFiles", { count: preview.ignored_files.length })} hint={t("import.ignoredHint")}>
          <ul className="mono" style={s.list}>
            {preview.ignored_files.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </FormField>
      )}
      {preview.warnings.length > 0 && (
        <FormField label={t("import.warnings")}>
          <ul style={s.warnings}>
            {preview.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </FormField>
      )}
    </>
  );
}
