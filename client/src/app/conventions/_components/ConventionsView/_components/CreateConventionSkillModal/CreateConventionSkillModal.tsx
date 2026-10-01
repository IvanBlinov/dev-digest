/* CreateConventionSkillModal — "Create skill from conventions" (req 41, 51). Prefilled from the
   server-built draft for the accepted candidates; every field and the body are editable. Saves a
   new skill and (optionally) links it to an agent. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ErrorState, FormField, Icon, Modal, SelectInput, TextInput, Toggle } from "@devdigest/ui";
import type { CreateConventionSkillResult, SkillType } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useConventionSkillDraft, useCreateConventionSkill } from "@/lib/hooks/conventions";
import { useAgents } from "@/lib/hooks/agents";
import { useToast } from "@/lib/toast";
import { SKILL_BODY_MAX, SKILL_TYPES } from "@/lib/skill-helpers";
import { BodyEditor } from "@/components/skill-body-editor";
import { BODY_EDITOR_HEIGHT, HTTP_CONFLICT, MODAL_WIDTH, NO_AGENT } from "./constants";
import { bodyError, defaultAgentId, fromDraft, nameError, type SkillForm } from "./helpers";
import { s } from "./styles";

export interface CreateConventionSkillModalProps {
  repoId: string;
  repoName: string;
  candidateIds: string[];
  onClose: () => void;
  onCreated: (result: CreateConventionSkillResult) => void;
}

export function CreateConventionSkillModal({
  repoId,
  repoName,
  candidateIds,
  onClose,
  onCreated,
}: CreateConventionSkillModalProps) {
  const t = useTranslations("conventions");
  const toast = useToast();
  const draft = useConventionSkillDraft(repoId, candidateIds);
  const { data: agents } = useAgents();
  const create = useCreateConventionSkill(repoId);

  const [form, setForm] = React.useState<SkillForm | null>(() => (draft.data ? fromDraft(draft.data) : null));
  const [agentChoice, setAgentChoice] = React.useState<string | null>(null);
  const [submitted, setSubmitted] = React.useState(false);
  const [takenName, setTakenName] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (draft.data && !form) setForm(fromDraft(draft.data));
  }, [draft.data, form]);

  const agentId = agentChoice ?? defaultAgentId(agents);
  const set = <K extends keyof SkillForm>(key: K, v: SkillForm[K]) => setForm((f) => (f ? { ...f, [key]: v } : f));

  const submit = () => {
    if (!form) return;
    setSubmitted(true);
    if (nameError(form.name, true, takenName) || bodyError(form.body, true)) return;
    create.mutate(
      {
        candidate_ids: candidateIds,
        name: form.name,
        description: form.description,
        type: form.type,
        enabled: form.enabled,
        body: form.body,
        agent_id: agentId === NO_AGENT ? null : agentId,
      },
      {
        onSuccess: (res) => {
          toast.success(t("page.created", { name: res.skill.name }));
          onCreated(res);
        },
        onError: (e) => {
          // Other errors are toasted by the global MutationCache (providers.tsx).
          if (e instanceof ApiError && e.status === HTTP_CONFLICT) setTakenName(form.name);
        },
      },
    );
  };

  const footer = (
    <div style={s.footer}>
      <span style={s.footerNote}>{t("modal.footerNote")}</span>
      <Button kind="ghost" onClick={onClose}>
        {t("modal.cancel")}
      </Button>
      <Button kind="primary" icon="Plus" onClick={submit} loading={create.isPending} disabled={!form}>
        {create.isPending ? t("modal.creating") : t("modal.submit")}
      </Button>
    </div>
  );

  return (
    <Modal width={MODAL_WIDTH} title={t("modal.title")} subtitle={form?.name || undefined} onClose={onClose} footer={footer}>
      {draft.isError && !form ? (
        <ErrorState
          body={t("modal.draftFailed", { message: draft.error?.message ?? "" })}
          onRetry={() => void draft.refetch()}
        />
      ) : !form ? (
        <div style={s.loading}>{t("modal.loading")}</div>
      ) : (
        <div style={s.body}>
          <div style={s.banner}>
            <Icon.Info size={15} style={s.bannerIcon} />
            <span>
              {t.rich("modal.banner", {
                count: candidateIds.length,
                repo: repoName,
                mono: (chunks) => (
                  <span className="mono" style={s.repo}>
                    {chunks}
                  </span>
                ),
              })}
            </span>
          </div>
          <FormFields
            form={form}
            set={set}
            agentId={agentId}
            onAgent={setAgentChoice}
            agents={agents ?? []}
            nameErrorKey={nameError(form.name, submitted, takenName)}
          />
          <FormField label={t("modal.body")} required>
            <BodyEditor
              label={t("modal.body")}
              value={form.body}
              onChange={(v) => set("body", v)}
              fileName={form.name || undefined}
              dirty={!!draft.data && form.body !== draft.data.body}
              height={BODY_EDITOR_HEIGHT}
            />
            <BodyErrorLine body={form.body} submitted={submitted} />
          </FormField>
        </div>
      )}
    </Modal>
  );
}

interface FormFieldsProps {
  form: SkillForm;
  set: <K extends keyof SkillForm>(key: K, v: SkillForm[K]) => void;
  agentId: string;
  onAgent: (id: string) => void;
  agents: { id: string; name: string }[];
  nameErrorKey: ReturnType<typeof nameError>;
}

/** Name / Description / Type / Enabled / Attach to agent. */
function FormFields({ form, set, agentId, onAgent, agents, nameErrorKey }: FormFieldsProps) {
  const t = useTranslations("conventions");
  const typeOptions = SKILL_TYPES.map((ty) => ({ value: ty, label: t(`modal.types.${ty}`) }));
  const agentOptions = [{ value: NO_AGENT, label: t("modal.noAgent") }, ...agents.map((a) => ({ value: a.id, label: a.name }))];

  return (
    <>
      <FormField label={t("modal.name")} required hint={nameErrorKey ? undefined : t("modal.nameHint")}>
        <TextInput
          aria-label={t("modal.name")}
          aria-invalid={nameErrorKey ? true : undefined}
          value={form.name}
          onChange={(v) => set("name", v)}
          mono
        />
        {nameErrorKey && (
          <div role="alert" style={s.error}>
            {t(nameErrorKey)}
          </div>
        )}
      </FormField>
      <FormField label={t("modal.description")}>
        <TextInput aria-label={t("modal.description")} value={form.description} onChange={(v) => set("description", v)} />
      </FormField>
      <div style={s.grid}>
        <FormField label={t("modal.type")}>
          <SelectInput value={form.type} onChange={(v) => set("type", v as SkillType)} options={typeOptions} />
        </FormField>
        <FormField label={t("modal.enabled")}>
          <div style={s.toggleRow}>
            <Toggle on={form.enabled} onChange={(v) => set("enabled", v)} />
            <span style={s.toggleHint}>{t("modal.enabledHint")}</span>
          </div>
        </FormField>
      </div>
      <FormField label={t("modal.agent")} hint={agentId === NO_AGENT ? undefined : t("modal.agentHint")}>
        <SelectInput value={agentId} onChange={onAgent} options={agentOptions} mono={false} />
      </FormField>
    </>
  );
}

function BodyErrorLine({ body, submitted }: { body: string; submitted: boolean }) {
  const t = useTranslations("conventions");
  const key = bodyError(body, submitted);
  if (!key) return null;
  return (
    <div role="alert" style={s.error}>
      {key === "modal.bodyTooLong" ? t(key, { max: SKILL_BODY_MAX }) : t(key)}
    </div>
  );
}
