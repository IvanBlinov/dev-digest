/* ConventionsToolbar — "N of M accepted", Deselect all, and Create skill (only when ≥ 1 accepted, req 50). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { s } from "./styles";

export interface ConventionsToolbarProps {
  accepted: number;
  total: number;
  onDeselectAll: () => void;
  onCreateSkill: () => void;
  deselecting?: boolean;
}

export function ConventionsToolbar({ accepted, total, onDeselectAll, onCreateSkill, deselecting }: ConventionsToolbarProps) {
  const t = useTranslations("conventions");
  return (
    <div style={s.bar}>
      <Button kind="ghost" size="sm" onClick={onDeselectAll} disabled={accepted === 0} loading={deselecting}>
        {t("toolbar.deselectAll")}
      </Button>
      <span className="tnum" style={s.count}>
        {t("toolbar.acceptedCount", { accepted, total })}
      </span>
      {accepted > 0 && (
        <Button kind="primary" size="sm" icon="Sparkles" onClick={onCreateSkill} style={s.create}>
          {t("toolbar.createSkill")}
        </Button>
      )}
    </div>
  );
}
