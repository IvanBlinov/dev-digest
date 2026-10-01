import { SKILL_BODY_MAX } from '@devdigest/shared';

/** Constants for the skills module (L02). */

/** Max decoded size of an uploaded `.md` / `.zip` file. */
export const MAX_UPLOAD_BYTES = 1_048_576;

/** Max entries in an uploaded zip (directories included). */
export const MAX_ZIP_ENTRIES = 200;

/** Max total declared uncompressed size of all zip entries (zip-bomb guard). */
export const MAX_ZIP_UNCOMPRESSED_BYTES = 5 * 1_048_576;

/**
 * Hard cap on the INFLATED size of the one markdown entry taken from a zip,
 * enforced during inflation (headers may lie about sizes). 4 bytes per body
 * character is the UTF-8 worst case of `SKILL_BODY_MAX`.
 */
export const MAX_ZIP_MARKDOWN_BYTES = SKILL_BODY_MAX * 4;

/**
 * Zip bytes fed to the streaming inflater per step. Deflate expands at most
 * ~1032x, so one step can emit at most ~4 MB before the output cap is checked.
 */
export const ZIP_PUSH_CHUNK_BYTES = 4_096;

/**
 * Route body limit for the import endpoints: base64 inflates the upload by 4/3,
 * plus room for the JSON envelope and the optional edited fields.
 */
export const IMPORT_BODY_LIMIT = Math.ceil((MAX_UPLOAD_BYTES * 4) / 3) + 16_384;

/** Max description length (mirrors the `CreateSkillBody` contract). */
export const MAX_DESCRIPTION_CHARS = 500;

/** Name used when neither frontmatter, heading nor file name yields a valid slug. */
export const FALLBACK_SKILL_NAME = 'imported-skill';

/** Unique index on (workspace_id, name) — the only unique clash mapped to 409. */
export const SKILL_NAME_UNIQUE_CONSTRAINT = 'skills_workspace_name_uq';

export const SKILL_NAME_MIN = 2;
export const SKILL_NAME_MAX = 64;

/** Version-note messages written by the service. */
export const INITIAL_VERSION_MESSAGE = 'Initial version';
export const restoredMessage = (version: number): string => `Restored from v${version}`;
export const importedMessage = (filename: string): string => `Imported from ${filename}`;

/** L03b — max chars of an injection finding's excerpt (mirrors the contract doc). */
export const MAX_INJECTION_EXCERPT_CHARS = 120;

/** L03c — URL import: body cap (same as an upload), whole-request deadline, name fallback file. */
export const URL_IMPORT_MAX_BYTES = MAX_UPLOAD_BYTES;
export const URL_IMPORT_TIMEOUT_MS = 10_000;
export const URL_IMPORT_FALLBACK_FILE = 'skill.md';
