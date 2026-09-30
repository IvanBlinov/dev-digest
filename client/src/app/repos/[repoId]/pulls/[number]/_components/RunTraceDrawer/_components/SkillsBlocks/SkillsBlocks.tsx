/* SkillsBlocks — L02: the "Skills" group of the prompt assembly. A header with
   the skill count + the tokens of the whole skills block, then one PromptBlock
   per injected skill, in prompt order. Renders nothing when no skill was
   injected (a disabled skill never has a block). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { SkillPromptBlock } from "@devdigest/shared";
import { PROMPT_COLORS } from "../../constants";
import { s } from "../../styles";
import { PromptBlock } from "../PromptBlock";

export function SkillsBlocks({ blocks, totalTokens }: { blocks: SkillPromptBlock[]; totalTokens: number | null }) {
  const t = useTranslations("runs");
  if (blocks.length === 0) return null;
  const total = totalTokens ?? blocks.reduce((n, b) => n + b.tokens, 0);
  return (
    <div style={s.skillsGroup}>
      <div style={s.skillsHead}>
        <span style={s.promptDot(PROMPT_COLORS.skills)} />
        <span style={s.promptLabel}>{t("trace.prompt.skillsSection")}</span>
        <span style={s.skillsSummary}>{t("trace.prompt.skillsSummary", { count: blocks.length, tokens: total })}</span>
      </div>
      {blocks.map((b) => (
        <PromptBlock
          key={b.skill_id}
          label={t("trace.prompt.skillBlock", { name: b.name, version: b.version, tokens: b.tokens })}
          text={b.text}
          color={PROMPT_COLORS.skills}
        />
      ))}
    </div>
  );
}
