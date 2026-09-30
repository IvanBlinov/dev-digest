/* ConfirmDialog — destructive-action confirmation (confirm / cancel / close X).
   Callers pass translated title, body and confirm label; Cancel comes from common. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Modal, Button } from "@devdigest/ui";
import { s } from "./styles";

export interface ConfirmDialogProps {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** True while the confirmed action is in flight — confirm is disabled. */
  busy?: boolean;
}

export function ConfirmDialog({ title, body, confirmLabel, onConfirm, onCancel, busy }: ConfirmDialogProps) {
  const t = useTranslations("common");
  return (
    <Modal
      width={440}
      title={title}
      onClose={onCancel}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onCancel}>
            {t("actions.cancel")}
          </Button>
          <Button kind="danger" onClick={onConfirm} loading={busy} disabled={busy}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div style={s.body}>{body}</div>
    </Modal>
  );
}
