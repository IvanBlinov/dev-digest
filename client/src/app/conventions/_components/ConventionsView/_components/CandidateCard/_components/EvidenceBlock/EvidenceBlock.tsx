/* EvidenceBlock — the grounding of a convention: `path:start-end` header, the cited snippet
   in mono, and a copy button. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { IconBtn } from "@devdigest/ui";
import { useToast } from "@/lib/toast";
import { s } from "./styles";

export interface EvidenceBlockProps {
  /** `path:start-end` (see CandidateCard helpers). */
  location: string;
  snippet: string;
}

export function EvidenceBlock({ location, snippet }: EvidenceBlockProps) {
  const t = useTranslations("conventions");
  const toast = useToast();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      toast.success(t("card.copied"));
    } catch {
      toast.error(t("card.copyFailed"));
    }
  };

  return (
    <div style={s.card}>
      <div style={s.header}>
        <span className="mono" style={s.location}>
          {location}
        </span>
        <IconBtn icon="Copy" size={24} label={t("card.copy")} onClick={() => void copy()} />
      </div>
      {snippet && (
        <pre className="mono" style={s.snippet} data-testid="evidence-snippet">
          {snippet}
        </pre>
      )}
    </div>
  );
}
