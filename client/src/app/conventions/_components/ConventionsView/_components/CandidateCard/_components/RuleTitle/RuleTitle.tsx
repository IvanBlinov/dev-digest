/* RuleTitle — the convention's rule as a click-to-rename title. Click (or Enter/Space) turns it
   into a field; Enter or blur saves, Shift+Enter adds a line, Escape cancels. An unchanged title
   closes without a request; an invalid one shows an error on Enter and reverts on blur. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { RULE_TITLE_MAX } from "./constants";
import { ruleTitleError, type RuleTitleError } from "./helpers";
import { s } from "./styles";

export interface RuleTitleProps {
  rule: string;
  onSave: (rule: string) => void;
  disabled?: boolean;
}

const ERROR_KEY: Record<RuleTitleError, "edit.ruleTooShort" | "edit.ruleTooLong"> = {
  tooShort: "edit.ruleTooShort",
  tooLong: "edit.ruleTooLong",
};

export function RuleTitle({ rule, onSave, disabled }: RuleTitleProps) {
  const t = useTranslations("conventions");
  const [draft, setDraft] = React.useState<string | null>(null);
  const [error, setError] = React.useState<RuleTitleError | null>(null);
  const fieldRef = React.useRef<HTMLTextAreaElement>(null);
  const editing = draft !== null;

  React.useEffect(() => {
    if (editing) fieldRef.current?.select();
  }, [editing]);

  const close = () => {
    setDraft(null);
    setError(null);
  };

  /** `strict` = Enter: an invalid title stays open with an error; blur just reverts. */
  const commit = (strict: boolean) => {
    if (draft === null) return;
    const next = draft.trim();
    if (next === rule.trim()) return close();
    const err = ruleTitleError(next);
    if (err) {
      if (strict) setError(err);
      else close();
      return;
    }
    onSave(next);
    close();
  };

  if (!editing) {
    return (
      <p
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={t("card.editTitle")}
        aria-disabled={disabled || undefined}
        title={t("card.editTitle")}
        style={s.title(!!disabled)}
        onClick={() => !disabled && setDraft(rule)}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setDraft(rule);
          }
        }}
      >
        {rule}
      </p>
    );
  }

  return (
    <div style={s.wrap}>
      <textarea
        ref={fieldRef}
        aria-label={t("card.titleField")}
        aria-invalid={error ? true : undefined}
        autoFocus
        rows={Math.min(4, Math.max(1, Math.ceil(draft.length / 90)))}
        maxLength={RULE_TITLE_MAX + 50}
        value={draft}
        style={s.field(!!error)}
        onChange={(e) => {
          setDraft(e.target.value);
          if (error) setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            commit(true);
          } else if (e.key === "Escape") {
            e.preventDefault();
            close();
          }
        }}
        onBlur={() => commit(false)}
      />
      {error ? (
        <div role="alert" style={s.error}>
          {t(ERROR_KEY[error])}
        </div>
      ) : (
        <div style={s.hint}>{t("card.titleHint")}</div>
      )}
    </div>
  );
}
