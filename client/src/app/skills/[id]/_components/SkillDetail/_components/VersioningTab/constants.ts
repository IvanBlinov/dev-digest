import type { DiffKind } from "@/lib/skill-diff";

/** Gutter prefix per diff line kind (unified-diff style). */
export const DIFF_PREFIX: Record<DiffKind, string> = { add: "+ ", del: "- ", same: "  " };

export const DATE_FORMAT: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };
