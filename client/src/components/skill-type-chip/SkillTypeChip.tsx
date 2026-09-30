/* SkillTypeChip — the colour-coded rubric label of a skill (rubric / convention / security / custom).
   Shared by the Skills list and the agent editor's Skills tab. */
import React from "react";
import { Badge } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { SKILL_TYPE_COLORS } from "./constants";

export function SkillTypeChip({ type }: { type: SkillType }) {
  const c = SKILL_TYPE_COLORS[type] ?? SKILL_TYPE_COLORS.custom;
  return (
    <Badge color={c.color} bg={c.bg} mono>
      {type}
    </Badge>
  );
}
