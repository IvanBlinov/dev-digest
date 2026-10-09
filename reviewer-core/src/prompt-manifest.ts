/**
 * Prompt section manifest. Describes WHAT went into a prompt (name, source,
 * trust, size) without ever carrying the text itself, so a caller can log it.
 * Pure: token counting and hashing are injected via `SectionMeter`.
 */

export type PromptSectionTrust = 'trusted' | 'untrusted';

export interface PromptSection {
  /** Stable section name, e.g. `system:guard`, `diff`, `skill:0`, `issue:#471`. */
  name: string;
  /** Where the content came from, e.g. `reviewer-core`, `pr`, `diff`. */
  source: string;
  trust: PromptSectionTrust;
  chars: number;
  tokens?: number;
  sha256?: string;
  /** Only on constant sections authored by reviewer-core; capped. */
  preview?: string;
}

/** Injected measuring functions (the core never imports crypto or a tokenizer). */
export interface SectionMeter {
  tokens?: (text: string) => number;
  digest?: (text: string) => string;
}

/** Fired once per prompt build, before the LLM call. */
export interface PromptAssembledInfo {
  sections: PromptSection[];
  mode: 'single-pass' | 'map-reduce';
  /** Map-reduce only. */
  chunk?: { index: number; total: number; file: string };
}

export const PREVIEW_MAX_CHARS = 200;

/** Build one manifest entry from the section text; the text is not retained. */
export function measure(
  name: string,
  source: string,
  trust: PromptSectionTrust,
  text: string,
  meter?: SectionMeter,
  preview?: string,
): PromptSection {
  return {
    name,
    source,
    trust,
    chars: text.length,
    ...(meter?.tokens ? { tokens: meter.tokens(text) } : {}),
    ...(meter?.digest ? { sha256: meter.digest(text) } : {}),
    ...(preview !== undefined ? { preview: preview.slice(0, PREVIEW_MAX_CHARS) } : {}),
  };
}
