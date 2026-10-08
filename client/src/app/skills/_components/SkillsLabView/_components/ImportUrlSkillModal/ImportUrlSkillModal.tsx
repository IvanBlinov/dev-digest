/* ImportUrlSkillModal — import a skill from a URL (L03c). The server fetches and parses a raw
   .md/.txt file (POST /skills/import-url/preview); the core is previewed and editable, then saved
   with source `imported_url` (POST /skills/import-url). Server errors show under the URL field. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, TextInput } from "@devdigest/ui";
import type { Skill, SkillImportPreview } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useImportSkillFromUrl, useSkillUrlImportPreview } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import type { SkillMeta } from "@/lib/skill-helpers";
import { nameErrorKey } from "@/app/skills/_components/SkillFields";
import { ImportPreview } from "../ImportPreview";
import { HTTP_CONFLICT, MODAL_WIDTH } from "./constants";
import { isHttpUrl } from "./helpers";
import { s } from "./styles";

export interface ImportUrlSkillModalProps {
  onClose: () => void;
  onImported: (skill: Skill) => void;
}

export function ImportUrlSkillModal({ onClose, onImported }: ImportUrlSkillModalProps) {
  const t = useTranslations("skills");
  const toast = useToast();
  const previewMut = useSkillUrlImportPreview();
  const importMut = useImportSkillFromUrl();
  const [url, setUrl] = React.useState("");
  const [preview, setPreview] = React.useState<SkillImportPreview | null>(null);
  const [meta, setMeta] = React.useState<SkillMeta | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [takenName, setTakenName] = React.useState<string | null>(null);
  // The URL whose preview is wanted; a response for any other URL is stale and dropped.
  const wantedUrl = React.useRef<string | null>(null);

  const trimmed = url.trim();
  const valid = isHttpUrl(trimmed);
  const nameKey = meta ? nameErrorKey(meta.name, { submitted: true, takenName }) : null;

  const onUrlChange = (next: string) => {
    setUrl(next);
    setPreview(null);
    setMeta(null);
    setError(null);
    setTakenName(null);
    wantedUrl.current = null;
  };

  const fetchPreview = () => {
    if (!valid || previewMut.isPending) return;
    setError(null);
    wantedUrl.current = trimmed;
    const requested = trimmed;
    previewMut.mutate(
      { url: requested },
      {
        onSuccess: (p) => {
          if (wantedUrl.current !== requested) return;
          setPreview(p);
          setMeta({ name: p.name, description: p.description, type: p.type });
        },
        onError: (e) => {
          if (wantedUrl.current === requested) setError(e.message);
        },
      },
    );
  };

  const save = () => {
    if (!preview || !meta || nameKey || !wantedUrl.current) return;
    setError(null);
    importMut.mutate(
      { url: wantedUrl.current, name: meta.name, description: meta.description, type: meta.type },
      {
        onSuccess: (skill) => {
          toast.success(t("importUrl.success", { name: skill.name }));
          onImported(skill);
        },
        onError: (e) => {
          if (e instanceof ApiError && e.status === HTTP_CONFLICT) setTakenName(meta.name);
          else setError(e.message);
        },
      },
    );
  };

  const footer = (
    <div style={s.footer}>
      <Button kind="ghost" onClick={onClose}>
        {t("importUrl.cancel")}
      </Button>
      <Button kind="primary" icon="Upload" onClick={save} disabled={!preview || !!nameKey} loading={importMut.isPending}>
        {importMut.isPending ? t("importUrl.saving") : t("importUrl.save")}
      </Button>
    </div>
  );

  return (
    <Modal width={MODAL_WIDTH} title={t("importUrl.title")} subtitle={t("importUrl.subtitle")} onClose={onClose} footer={footer}>
      <div style={s.body}>
        <FormField label={t("importUrl.urlLabel")} required hint={t("importUrl.urlHint")}>
          <div style={s.urlRow}>
            <div style={s.urlInput}>
              <TextInput
                autoFocus
                aria-label={t("importUrl.urlLabel")}
                aria-invalid={trimmed && !valid ? true : undefined}
                type="url"
                value={url}
                onChange={onUrlChange}
                onKeyDown={(e) => e.key === "Enter" && fetchPreview()}
                placeholder={t("importUrl.urlPlaceholder")}
                mono
              />
            </div>
            <Button kind="secondary" icon="Globe" onClick={fetchPreview} disabled={!valid} loading={previewMut.isPending}>
              {previewMut.isPending ? t("importUrl.fetching") : t("importUrl.fetch")}
            </Button>
          </div>
          {trimmed && !valid && <div style={s.invalid}>{t("importUrl.invalidUrl")}</div>}
          {error && (
            <div role="alert" style={s.error}>
              {error}
            </div>
          )}
        </FormField>

        {preview && meta && (
          <ImportPreview
            preview={preview}
            meta={meta}
            onMetaChange={setMeta}
            nameError={nameKey ? t(nameKey) : null}
            sourceLabel={t("importUrl.sourceUrl")}
            sourceValue={preview.source_url ?? wantedUrl.current ?? trimmed}
          />
        )}
      </div>
    </Modal>
  );
}
