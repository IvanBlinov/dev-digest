/** Constants for the intent module (L03 Intent Layer). */

/** Reference caps (what we try to fetch / record). */
export const MAX_ISSUES = 3;
export const MAX_DOCS = 3;
export const MAX_UNRESOLVED = 5;

/** Per-source fetch timeout. */
export const SOURCE_TIMEOUT_MS = 8_000;
/** Text caps for fetched sources (the prompt re-applies the same caps). */
export const MAX_ISSUE_CHARS = 4_000;
export const MAX_DOC_CHARS = 12_000;

/** Hunk-header extraction caps. */
export const MAX_HEADERS_PER_FILE = 10;
export const MAX_HEADER_CHARS = 160;

/** Ref strings stored/logged are clipped to this. */
export const MAX_REF_CHARS = 200;

/** Doc extensions treated as plans/specs. */
export const DOC_EXTENSIONS = ['md', 'mdx', 'txt'] as const;

/** The classifier call: cheap, deterministic, bounded. */
export const CLASSIFY_TEMPERATURE = 0;
export const CLASSIFY_MAX_TOKENS = 1_200;
export const CLASSIFY_TIMEOUT_MS = 30_000;
export const CLASSIFY_MAX_RETRIES = 1;

/** Output clamps (the LLM json_schema carries no length constraints). */
export const MAX_SUMMARY_CHARS = 600;
export const MAX_SCOPE_ITEMS = 8;
export const MAX_SCOPE_ITEM_CHARS = 200;
export const MAX_MISSING_ITEMS = 10;

/** POST /pulls/:id/intent rate limit. */
export const DETECT_RATE_LIMIT = { max: 6, timeWindow: '1 minute' } as const;
