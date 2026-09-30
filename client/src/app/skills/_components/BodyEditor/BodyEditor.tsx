/* BodyEditor — markdown body editor for a skill: line-number gutter (scroll-synced with the
   textarea), a header with `<name>.md`, an `unsaved` badge and the "~N tokens" estimate. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import { estimateTokens } from "@/lib/skill-helpers";
import { DEFAULT_EDITOR_HEIGHT } from "./constants";
import { s } from "./styles";

export interface BodyEditorProps {
  value: string;
  onChange: (v: string) => void;
  /** Accessible label of the textarea. */
  label: string;
  /** Shown in the header as `<fileName>.md`; omitted → no file name. */
  fileName?: string;
  dirty?: boolean;
  placeholder?: string;
  height?: number;
}

export function BodyEditor({ value, onChange, label, fileName, dirty, placeholder, height }: BodyEditorProps) {
  const t = useTranslations("skills");
  const gutterRef = React.useRef<HTMLDivElement>(null);
  const lineCount = Math.max(1, value.split("\n").length);
  const numbers = React.useMemo(
    () => Array.from({ length: lineCount }, (_, i) => String(i + 1)).join("\n"),
    [lineCount],
  );

  const syncScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
  };

  return (
    <div style={s.card}>
      <div style={s.header}>
        {fileName && (
          <span className="mono" style={s.fileName}>
            {fileName}.md
          </span>
        )}
        {dirty && <Badge color="var(--warn, #f59e0b)">{t("config.unsaved")}</Badge>}
        <span className="tnum" style={s.tokens}>
          {t("form.tokens", { count: estimateTokens(value) })}
        </span>
      </div>
      <div style={s.body(height ?? DEFAULT_EDITOR_HEIGHT)}>
        <div ref={gutterRef} style={s.gutter} aria-hidden="true" data-testid="line-gutter">
          {numbers}
        </div>
        <textarea
          aria-label={label}
          value={value}
          placeholder={placeholder}
          spellCheck={false}
          wrap="off"
          onChange={(e) => onChange(e.target.value)}
          onScroll={syncScroll}
          style={s.textarea}
        />
      </div>
    </div>
  );
}
