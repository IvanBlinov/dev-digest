import { RULE_TITLE_MAX, RULE_TITLE_MIN } from "./constants";

export type RuleTitleError = "tooShort" | "tooLong";

/** Length check on the trimmed title, same limits as the API contract. */
export function ruleTitleError(text: string): RuleTitleError | null {
  const len = text.trim().length;
  if (len < RULE_TITLE_MIN) return "tooShort";
  if (len > RULE_TITLE_MAX) return "tooLong";
  return null;
}
