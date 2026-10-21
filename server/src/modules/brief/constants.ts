/** Brief module constants (SPEC-03). */

/** POST /pulls/:id/brief: 6 generations per minute (AC-35). */
export const BRIEF_RATE_LIMIT_MAX = 6;
export const BRIEF_RATE_LIMIT_WINDOW = '1 minute';
/** Hard timeout of the single LLM request. */
export const BRIEF_TIMEOUT_MS = 60_000;

// Post-validation clamps (AC-28). The LLM schema carries no limits (strict json_schema).
export const MAX_SUMMARY_CHARS = 800;
export const MAX_RISKS = 6;
export const MAX_FOCUS = 8;
export const MAX_RISK_TITLE_CHARS = 120;
export const MAX_TEXT_CHARS = 400;
/** Provenance refs are clipped to this many characters (AC-30). */
export const MAX_REF_CHARS = 200;
