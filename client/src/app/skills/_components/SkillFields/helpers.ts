import { skillNameError } from "@/lib/skill-helpers";

export type NameErrorKey = "form.nameRequired" | "form.nameInvalid" | "form.nameTaken";

/**
 * Which name error to show: format errors appear while typing, "required" only after a submit
 * attempt, and "taken" when the server answered 409 for exactly this name.
 */
export function nameErrorKey(name: string, opts: { submitted: boolean; takenName?: string | null }): NameErrorKey | null {
  const err = skillNameError(name);
  if (err === "invalid") return "form.nameInvalid";
  if (err === "required") return opts.submitted ? "form.nameRequired" : null;
  if (opts.takenName && opts.takenName === name) return "form.nameTaken";
  return null;
}
