/* InjectionChip — red "Injection detected" label for a skill whose body failed the
   prompt-injection scan (L03b). Shared by the Skills list, the skill detail header and the
   agent editor's Skills tab. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";

export function InjectionChip() {
  const t = useTranslations("common");
  return (
    <Badge icon="AlertTriangle" color="var(--crit)" bg="var(--crit-bg)">
      {t("injectionChip.label")}
    </Badge>
  );
}
