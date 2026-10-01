/* ConfigTab — edit a skill's name, description, type, body (line-numbered editor) and enabled flag.
   Save PUTs only the changed fields (+ optional version note); the server bumps the version. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, TextInput, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { SKILL_BODY_MAX } from "@/lib/skill-helpers";
import { BodyEditor } from "@/components/skill-body-editor";
import { SkillFields, nameErrorKey } from "@/app/skills/_components/SkillFields";
import { EDITOR_HEIGHT, HTTP_CONFLICT } from "./constants";
import { buildPatch, draftFrom, isDirty, type ConfigDraft } from "./helpers";
import { s } from "./styles";

export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const update = useUpdateSkill();
  const [draft, setDraft] = React.useState<ConfigDraft>(() => draftFrom(skill));
  const [note, setNote] = React.useState("");
  const [takenName, setTakenName] = React.useState<string | null>(null);

  const dirty = isDirty(skill, draft);
  const nameKey = nameErrorKey(draft.name, { submitted: true, takenName });
  const bodyError = !draft.body.trim()
    ? t("form.bodyRequired")
    : draft.body.length > SKILL_BODY_MAX
      ? t("form.bodyTooLong", { max: SKILL_BODY_MAX })
      : null;
  const canSave = dirty && !nameKey && !bodyError && !update.isPending;

  const save = () => {
    if (!canSave) return;
    update.mutate(
      { id: skill.id, patch: buildPatch(skill, draft, note) },
      {
        onSuccess: (saved) => {
          setNote("");
          toast.success(t("config.saved", { name: saved.name, version: saved.version }));
        },
        onError: (e) => {
          if (e instanceof ApiError && e.status === HTTP_CONFLICT) setTakenName(draft.name);
          else toast.error(t("config.saveFailed", { message: e.message }));
        },
      },
    );
  };

  const discard = () => {
    setDraft(draftFrom(skill));
    setNote("");
    setTakenName(null);
  };

  const toggleEnabled = (enabled: boolean) =>
    update.mutate(
      { id: skill.id, patch: { enabled } },
      { onError: (e) => toast.error(t("config.saveFailed", { message: e.message })) },
    );

  return (
    <div style={s.wrap}>
      <SkillFields
        value={draft}
        onChange={(meta) => setDraft({ ...draft, ...meta })}
        nameError={nameKey ? t(nameKey) : null}
      />
      <FormField label={t("form.enabled")}>
        <div style={s.enabledRow}>
          <Toggle on={skill.enabled} onChange={toggleEnabled} />
        </div>
      </FormField>
      <FormField label={t("form.body")} required>
        <BodyEditor
          label={t("form.body")}
          value={draft.body}
          onChange={(body) => setDraft({ ...draft, body })}
          fileName={skill.name}
          dirty={dirty}
          height={EDITOR_HEIGHT}
        />
        {bodyError && (
          <div role="alert" style={s.error}>
            {bodyError}
          </div>
        )}
      </FormField>
      <FormField label={t("config.versionNote")}>
        <TextInput
          aria-label={t("config.versionNote")}
          value={note}
          onChange={setNote}
          placeholder={t("config.versionNotePlaceholder")}
          maxLength={200}
        />
      </FormField>
      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={!canSave} loading={update.isPending}>
          {update.isPending ? t("config.saving") : t("config.save")}
        </Button>
        <Button kind="ghost" onClick={discard} disabled={!dirty && !note}>
          {t("config.discard")}
        </Button>
      </div>
    </div>
  );
}
