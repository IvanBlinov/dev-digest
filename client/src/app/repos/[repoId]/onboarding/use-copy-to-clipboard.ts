"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { useToast } from "@/lib/toast";

/** `copy(text, successMessage)` writes to the clipboard and toasts; a missing or rejecting
 *  clipboard toasts the localized failure instead (EC-27). */
export function useCopyToClipboard() {
  const t = useTranslations("onboarding");
  const toast = useToast();
  const copy = useCallback(
    async (text: string, successMessage: string) => {
      try {
        if (typeof navigator === "undefined" || !navigator.clipboard) throw new Error("no clipboard");
        await navigator.clipboard.writeText(text);
        toast.success(successMessage);
      } catch {
        toast.error(t("copy.failed"));
      }
    },
    [t, toast],
  );
  return { copy };
}
