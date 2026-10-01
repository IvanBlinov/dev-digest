/* CreateSkillModal — manual skill creation (req 11/12): name, description, type, markdown body. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useCreateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { SKILL_BODY_MAX, type SkillMeta } from "@/lib/skill-helpers";
import { BodyEditor } from "@/components/skill-body-editor";
import { SkillFields, nameErrorKey } from "@/app/skills/_components/SkillFields";
import { BODY_EDITOR_HEIGHT, EMPTY_META, HTTP_CONFLICT, MODAL_WIDTH } from "./constants";
import { s } from "./styles";

export interface CreateSkillModalProps {
  onClose: () => void;
  onCreated: (skill: Skill) => void;
}

export function CreateSkillModal({ onClose, onCreated }: CreateSkillModalProps) {
  const t = useTranslations("skills");
  const toast = useToast();
  const create = useCreateSkill();
  const [meta, setMeta] = React.useState<SkillMeta>(EMPTY_META);
  const [body, setBody] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);
  const [takenName, setTakenName] = React.useState<string | null>(null);

  const nameKey = nameErrorKey(meta.name, { submitted, takenName });
  const bodyError = !body.trim()
    ? submitted
      ? t("form.bodyRequired")
      : null
    : body.length > SKILL_BODY_MAX
      ? t("form.bodyTooLong", { max: SKILL_BODY_MAX })
      : null;

  const submit = () => {
    setSubmitted(true);
    const invalid = nameErrorKey(meta.name, { submitted: true, takenName }) !== null || !body.trim() || body.length > SKILL_BODY_MAX;
    if (invalid) return;
    create.mutate(
      { name: meta.name, description: meta.description, type: meta.type, body },
      {
        onSuccess: (skill) => {
          toast.success(t("create.success", { name: skill.name }));
          onCreated(skill);
        },
        onError: (e) => {
          if (e instanceof ApiError && e.status === HTTP_CONFLICT) setTakenName(meta.name);
          else toast.error(t("create.failed", { message: e.message }));
        },
      },
    );
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("create.title")}
      subtitle={t("create.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("create.cancel")}
          </Button>
          <Button kind="primary" icon="Plus" onClick={submit} loading={create.isPending}>
            {create.isPending ? t("create.creating") : t("create.submit")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <SkillFields value={meta} onChange={setMeta} nameError={nameKey ? t(nameKey) : null} />
        <FormField label={t("form.body")} required>
          <BodyEditor
            label={t("form.body")}
            value={body}
            onChange={setBody}
            fileName={meta.name || undefined}
            placeholder={t("form.bodyPlaceholder")}
            height={BODY_EDITOR_HEIGHT}
          />
          {bodyError && (
            <div role="alert" style={s.error}>
              {bodyError}
            </div>
          )}
        </FormField>
      </div>
    </Modal>
  );
}
