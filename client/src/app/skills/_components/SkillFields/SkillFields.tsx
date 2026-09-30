/* SkillFields — the Name / Description / Type trio shared by the create, import and config forms. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, SelectInput, TextInput } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { SKILL_TYPES, type SkillMeta } from "@/lib/skill-helpers";
import { s } from "./styles";

export interface SkillFieldsProps {
  value: SkillMeta;
  onChange: (next: SkillMeta) => void;
  /** Translated inline error under the name, or null. */
  nameError?: string | null;
}

export function SkillFields({ value, onChange, nameError }: SkillFieldsProps) {
  const t = useTranslations("skills");
  const set = <K extends keyof SkillMeta>(key: K, v: SkillMeta[K]) => onChange({ ...value, [key]: v });
  const typeOptions = SKILL_TYPES.map((ty) => ({ value: ty, label: t(`types.${ty}`) }));

  return (
    <>
      <FormField label={t("form.name")} required hint={nameError ? undefined : t("form.nameHint")}>
        <TextInput
          aria-label={t("form.name")}
          aria-invalid={nameError ? true : undefined}
          value={value.name}
          onChange={(v) => set("name", v)}
          placeholder={t("form.namePlaceholder")}
          mono
        />
        {nameError && (
          <div role="alert" style={s.error}>
            {nameError}
          </div>
        )}
      </FormField>
      <FormField label={t("form.description")}>
        <TextInput
          aria-label={t("form.description")}
          value={value.description}
          onChange={(v) => set("description", v)}
          placeholder={t("form.descriptionPlaceholder")}
        />
      </FormField>
      <FormField label={t("form.type")}>
        <SelectInput value={value.type} onChange={(v) => set("type", v as SkillType)} options={typeOptions} />
      </FormField>
    </>
  );
}
