/* SpecsBlocks — L05: the "Project context" group of the prompt assembly. A
   header with the doc count + tokens, one PromptBlock per attached/auto doc,
   then the skipped documents with a reason label. Paths and origins are plain
   text; the document text is untrusted and shown verbatim. Renders nothing
   when nothing was injected or skipped. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { ProjectContextBlock, ProjectContextSkip } from "@devdigest/shared";
import { PROMPT_COLORS } from "../../constants";
import { s } from "../../styles";
import { PromptBlock } from "../PromptBlock";

export function SpecsBlocks({
  blocks,
  skipped,
  totalTokens,
}: {
  blocks: ProjectContextBlock[];
  skipped: ProjectContextSkip[];
  totalTokens: number | null;
}) {
  const t = useTranslations("runs");
  if (blocks.length === 0 && skipped.length === 0) return null;
  const total = totalTokens ?? blocks.reduce((n, b) => n + b.tokens, 0);
  return (
    <div style={s.skillsGroup}>
      <div style={s.skillsHead}>
        <span style={s.promptDot(PROMPT_COLORS.specs)} />
        <span style={s.promptLabel}>{t("trace.prompt.specsSection")}</span>
        <span style={s.skillsSummary}>{t("trace.prompt.specsSummary", { count: blocks.length, tokens: total })}</span>
      </div>
      {blocks.map((b) => (
        <PromptBlock
          key={b.path}
          label={t("trace.prompt.specBlock", { path: b.path, origin: b.origin, tokens: b.tokens })}
          text={b.text}
          color={PROMPT_COLORS.specs}
        />
      ))}
      {skipped.length > 0 && (
        <div>
          <div style={s.skillsSummary}>{t("trace.prompt.specsSkipped")}</div>
          {skipped.map((k) => (
            <div key={k.path} style={s.skillsHead}>
              <span className="mono" style={s.spec}>{k.path}</span>
              <span style={s.skillsSummary}>{t(`trace.prompt.skipReason.${k.reason}`)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
