/** Constants for the skills module (L02). */

/** Max decoded size of an uploaded `.md` / `.zip` file. */
export const MAX_UPLOAD_BYTES = 1_048_576;

/** Max entries in an uploaded zip (directories included). */
export const MAX_ZIP_ENTRIES = 200;

/** Max total declared uncompressed size of all zip entries (zip-bomb guard). */
export const MAX_ZIP_UNCOMPRESSED_BYTES = 5 * 1_048_576;

/**
 * Route body limit for the import endpoints: base64 inflates the upload by 4/3,
 * plus room for the JSON envelope and the optional edited fields.
 */
export const IMPORT_BODY_LIMIT = Math.ceil((MAX_UPLOAD_BYTES * 4) / 3) + 16_384;

/** Max description length (mirrors the `CreateSkillBody` contract). */
export const MAX_DESCRIPTION_CHARS = 500;

/** Name used when neither frontmatter, heading nor file name yields a valid slug. */
export const FALLBACK_SKILL_NAME = 'imported-skill';

export const SKILL_NAME_MIN = 2;
export const SKILL_NAME_MAX = 64;

/** Version-note messages written by the service. */
export const INITIAL_VERSION_MESSAGE = 'Initial version';
export const restoredMessage = (version: number): string => `Restored from v${version}`;
export const importedMessage = (filename: string): string => `Imported from ${filename}`;
