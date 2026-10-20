/** Constants for the onboarding module (L05b). Every limit in NFR-1 lives here. */

export const ONBOARDING_MAX_READING_PATH = 8;
export const ONBOARDING_MAX_CRITICAL_PATHS = 5;
export const ONBOARDING_MAX_COMMANDS = 6;
export const ONBOARDING_MAX_FIRST_TASKS = 3;

export const ONBOARDING_MAX_INPUT_TOKENS = 8000;
export const ONBOARDING_MAX_OUTPUT_TOKENS = 3000;
export const ONBOARDING_TIMEOUT_MS = 60_000;
export const ONBOARDING_TEMPERATURE = 0.2;

export const ONBOARDING_README_CHARS = 4000;
export const ONBOARDING_MAX_ENV_NAMES = 20;

export const ONBOARDING_MAX_NARRATIVE_CHARS = 1500;
export const ONBOARDING_MAX_REASON_CHARS = 120;
export const ONBOARDING_MAX_COMMAND_COMMENT_CHARS = 80;
export const ONBOARDING_MAX_TASK_TITLE_CHARS = 120;
export const ONBOARDING_MAX_TASK_DESCRIPTION_CHARS = 300;
export const ONBOARDING_MAX_SCRIPT_BODY_CHARS = 200;

export const ONBOARDING_MAX_DIAGRAM_MODULES = 8;
export const ONBOARDING_MAX_DIAGRAM_SERVICES = 4;

export const ONBOARDING_GENERATE_RATE_LIMIT = 6; // per minute
export const ONBOARDING_STALE_GENERATION_MS = 600_000;

/** Order in which root scripts and make targets are listed as run commands (AC-32). */
export const ONBOARDING_SCRIPT_ORDER = ['dev', 'start', 'build', 'test'] as const;
export const ONBOARDING_MAKE_ORDER = ['setup', 'install', 'dev', 'run', 'start', 'test'] as const;

/** Upper bound on one-level-deep package.json probes. */
export const ONBOARDING_MAX_TOP_DIRS = 30;

/** Wall-clock bound on one background generation (facts + one 60 s request). */
export const ONBOARDING_JOB_TIMEOUT_MS = 120_000;

/** Symbol rows requested for the prompt: only the reading-path and critical-path files. */
export const ONBOARDING_MAX_PROMPT_SYMBOL_FILES = 12;
