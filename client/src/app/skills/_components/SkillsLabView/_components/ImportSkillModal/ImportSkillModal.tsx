/* ImportSkillModal — import a skill from a .md or .zip (req 15). The file is parsed server-side
   (POST /skills/import/preview), the core is previewed and editable, then saved (POST /skills/import). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Markdown, Modal } from "@devdigest/ui";
import type { Skill, SkillImportPreview, SkillImportRequest } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useImportSkill, usePreviewSkillImport } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { importKind, readFileAsBase64, type SkillMeta } from "@/lib/skill-helpers";
import { SkillFields, nameErrorKey } from "../../../SkillFields";
import { ACCEPT, HTTP_CONFLICT, MAX_UPLOAD_BYTES, MODAL_WIDTH } from "./constants";
import { s } from "./styles";

export interface ImportSkillModalProps {
  onClose: () => void;
  onImported: (skill: Skill) => void;
}

export function ImportSkillModal({ onClose, onImported }: ImportSkillModalProps) {
  const t = useTranslations("skills");
  const toast = useToast();
  const previewMut = usePreviewSkillImport();
  const importMut = useImportSkill();
  const [upload, setUpload] = React.useState<SkillImportRequest | null>(null);
  const [preview, setPreview] = React.useState<SkillImportPreview | null>(null);
  const [meta, setMeta] = React.useState<SkillMeta | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [takenName, setTakenName] = React.useState<string | null>(null);

  const reset = () => {
    setUpload(null);
    setPreview(null);
    setMeta(null);
    setError(null);
    setTakenName(null);
  };

  const requestPreview = (req: SkillImportRequest) =>
    previewMut.mutate(req, {
      onSuccess: (p) => {
        setPreview(p);
        setMeta({ name: p.name, description: p.description, type: p.type });
      },
      onError: (e) => setError(t("import.previewFailed", { message: e.message })),
    });

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    reset();
    if (!file) return;
    if (!importKind(file.name)) return setError(t("import.badExtension"));
    if (file.size > MAX_UPLOAD_BYTES) return setError(t("import.tooLarge"));
    try {
      const req = { filename: file.name, content_base64: await readFileAsBase64(file) };
      setUpload(req);
      requestPreview(req);
    } catch {
      setError(t("import.readFailed"));
    }
  };

  const nameKey = meta ? nameErrorKey(meta.name, { submitted: true, takenName }) : null;

  const save = () => {
    if (!upload || !meta || nameKey) return;
    setError(null);
    importMut.mutate(
      { ...upload, name: meta.name, description: meta.description, type: meta.type },
      {
        onSuccess: (skill) => {
          toast.success(t("import.success", { name: skill.name }));
          onImported(skill);
        },
        onError: (e) => {
          if (e instanceof ApiError && e.status === HTTP_CONFLICT) setTakenName(meta.name);
          else setError(t("import.failed", { message: e.message }));
        },
      },
    );
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("import.title")}
      subtitle={t("import.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("import.cancel")}
          </Button>
          <Button
            kind="primary"
            icon="Upload"
            onClick={save}
            disabled={!preview || !!nameKey}
            loading={importMut.isPending}
          >
            {importMut.isPending ? t("import.saving") : t("import.save")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <FormField label={t("import.fileLabel")} required>
          <input type="file" accept={ACCEPT} aria-label={t("import.fileLabel")} onChange={onFile} style={s.fileInput} />
          {previewMut.isPending && <div style={s.muted}>{t("import.parsing")}</div>}
          {error && (
            <div role="alert" style={s.error}>
              {error}
            </div>
          )}
        </FormField>

        {preview && meta && (
          <>
            <div style={s.divider} />
            <SkillFields value={meta} onChange={setMeta} nameError={nameKey ? t(nameKey) : null} />
            <FormField label={t("import.sourceFile")}>
              <span className="mono" style={s.sourceFile}>
                {preview.source_file}
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
        )}
      </div>
    </Modal>
  );
}
