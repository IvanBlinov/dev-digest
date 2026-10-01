/* CandidateEditForm — inline edit of one convention (req 49): rule, category, evidence path,
   line range and snippet. Rendered inside the card in place of its read-only content. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, SelectInput, TextInput } from "@devdigest/ui";
import type { ConventionCandidate, ConventionCategory, UpdateConventionBody } from "@devdigest/shared";
import { CONVENTION_CATEGORIES } from "./constants";
import { fromCandidate, toPatch, validateDraft, type EditDraft } from "./helpers";
import { s } from "./styles";

export interface CandidateEditFormProps {
  candidate: ConventionCandidate;
  onSave: (patch: UpdateConventionBody) => void;
  onCancel: () => void;
  saving?: boolean;
}

export function CandidateEditForm({ candidate, onSave, onCancel, saving }: CandidateEditFormProps) {
  const t = useTranslations("conventions");
  const [draft, setDraft] = React.useState<EditDraft>(() => fromCandidate(candidate));
  const [submitted, setSubmitted] = React.useState(false);
  const errors = submitted ? validateDraft(draft) : [];
  const set = <K extends keyof EditDraft>(key: K, v: EditDraft[K]) => setDraft((d) => ({ ...d, [key]: v }));
  const categoryOptions = CONVENTION_CATEGORIES.map((c) => ({ value: c, label: t(`categories.${c}`) }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (validateDraft(draft).length > 0) return;
    onSave(toPatch(draft));
  };

  return (
    <form aria-label={t("card.edit")} onSubmit={submit} style={s.form}>
      <FormField label={t("edit.rule")} required>
        <textarea
          aria-label={t("edit.rule")}
          value={draft.rule}
          rows={2}
          onChange={(e) => set("rule", e.target.value)}
          style={s.textarea}
        />
      </FormField>
      <div style={s.row}>
        <div style={s.category}>
          <FormField label={t("edit.category")}>
            <label style={s.selectLabel}>
              <span style={s.srOnly}>{t("edit.category")}</span>
              <SelectInput
                value={draft.category}
                onChange={(v) => set("category", v as ConventionCategory)}
                options={categoryOptions}
                mono={false}
              />
            </label>
          </FormField>
        </div>
        <div style={s.path}>
          <FormField label={t("edit.path")} required>
            <TextInput aria-label={t("edit.path")} value={draft.path} onChange={(v) => set("path", v)} mono />
          </FormField>
        </div>
        <div style={s.line}>
          <FormField label={t("edit.startLine")}>
            <TextInput aria-label={t("edit.startLine")} inputMode="numeric" value={draft.start} onChange={(v) => set("start", v)} mono />
          </FormField>
        </div>
        <div style={s.line}>
          <FormField label={t("edit.endLine")}>
            <TextInput aria-label={t("edit.endLine")} inputMode="numeric" value={draft.end} onChange={(v) => set("end", v)} mono />
          </FormField>
        </div>
      </div>
      <FormField label={t("edit.snippet")}>
        <textarea
          aria-label={t("edit.snippet")}
          className="mono"
          value={draft.snippet}
          rows={5}
          spellCheck={false}
          onChange={(e) => set("snippet", e.target.value)}
          style={{ ...s.textarea, ...s.mono }}
        />
      </FormField>
      {errors.length > 0 && (
        <div role="alert" style={s.errors}>
          {errors.map((k) => (
            <div key={k}>{t(`edit.${k}`)}</div>
          ))}
        </div>
      )}
      <div style={s.actions}>
        <Button type="button" kind="ghost" size="sm" onClick={onCancel}>
          {t("edit.cancel")}
        </Button>
        <Button type="submit" kind="primary" size="sm" icon="Check" loading={saving}>
          {saving ? t("edit.saving") : t("edit.save")}
        </Button>
      </div>
    </form>
  );
}
