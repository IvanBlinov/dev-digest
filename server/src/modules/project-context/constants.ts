import { SKILL_BODY_MAX } from '@devdigest/shared';

/** Max documents returned by the listing (AC-5). */
export const CONTEXT_LISTING_CAP = 500;
/** Max length of a document path (AC-6). */
export const CONTEXT_PATH_MAX = 512;
/** Max bytes the file route and the preview read (AC-65). */
export const CONTEXT_FILE_READ_MAX_BYTES = 1_048_576;
/** Per-document cap injected into a prompt, in characters (AC-23); same value as a skill body. */
export const CONTEXT_DOC_MAX_CHARS = SKILL_BODY_MAX;
/** Token budget of the whole project-context section (AC-24). */
export const PROJECT_CONTEXT_MAX_TOKENS = 8000;
/** Directory names the walk never enters and no path may contain (AC-62). */
export const EXCLUDED_DOC_DIRS = ['.git', 'node_modules'] as const;
