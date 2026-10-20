import type { OnboardingNarrative, OnboardingReason, OnboardingTour } from '@devdigest/shared';
import type { CloneFacts } from './facts.js';
import {
  ONBOARDING_MAX_COMMANDS,
  ONBOARDING_MAX_COMMAND_COMMENT_CHARS,
  ONBOARDING_MAX_FIRST_TASKS,
  ONBOARDING_MAX_NARRATIVE_CHARS,
  ONBOARDING_MAX_REASON_CHARS,
  ONBOARDING_MAX_SCRIPT_BODY_CHARS,
  ONBOARDING_MAX_TASK_DESCRIPTION_CHARS,
  ONBOARDING_MAX_TASK_TITLE_CHARS,
} from './constants.js';

/** Pure helpers for the onboarding module. No I/O, no container. */

export interface DerivedCommand {
  id: string;
  command: string;
  comment: string | null;
  script_body: string | null;
}

/** Cut `text` to exactly `max` chars, ending in `…`, when it is longer. */
export function truncateAt(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

/** Run commands derived only from clone facts (AC-32, AC-34). Command text never comes from the LLM. */
export function deriveCommands(facts: CloneFacts): DerivedCommand[] {
  const pm = facts.packageManager;
  const out: DerivedCommand[] = [];
  const add = (id: string, command: string, comment: string | null = null, script_body: string | null = null) =>
    out.push({ id, command, comment, script_body });

  if (facts.hasRootPackageJson) add('install', `${pm} install`);
  if (facts.hasEnvExample) {
    const names = facts.envNames.join(', ');
    add('env', 'cp .env.example .env', names ? truncateAt(names, ONBOARDING_MAX_COMMAND_COMMENT_CHARS) : null);
  }
  if (facts.composeServices.length > 0) add('compose', `docker compose up -d ${facts.composeServices.join(' ')}`);
  for (const s of facts.scripts) {
    add(`script:${s.name}`, `${pm} run ${s.name}`, null, truncateAt(s.body, ONBOARDING_MAX_SCRIPT_BODY_CHARS));
  }
  for (const t of facts.makeTargets) add(`make:${t}`, `make ${t}`);

  return out.slice(0, ONBOARDING_MAX_COMMANDS);
}

type Sections = OnboardingTour['sections'];

export interface MergeInput {
  /** Deterministic sections (all five), the source of truth for facts, order and command text. */
  base: Sections;
  knownPaths: readonly string[];
  /** The validated LLM output, or null when there was no usable answer. */
  narrative: OnboardingNarrative | null;
  failure: OnboardingReason | null;
}

const firstBy = <T>(items: readonly T[], key: (t: T) => string): Map<string, T> => {
  const out = new Map<string, T>();
  for (const it of items) if (!out.has(key(it))) out.set(key(it), it);
  return out;
};

const nonEmpty = (text: string | undefined): string | null => (text !== undefined && text.trim() !== '' ? text.trim() : null);

/**
 * Merge the LLM narrative into the deterministic sections. The model may only decorate: it never
 * adds, removes or reorders facts, never writes command text, and every path it mentions must be a
 * known path. Anything else is dropped silently (AC-33, AC-36, AC-38, AC-39).
 */
export function mergeNarrative({ base, knownPaths, narrative, failure }: MergeInput): Sections {
  if (narrative === null) {
    return {
      ...base,
      first_tasks: { source: 'deterministic', unavailable_reason: failure ?? 'invalid_output', items: [] },
    };
  }
  const known = new Set(knownPaths);
  const llmIf = (reason: OnboardingReason | null) => (reason === null ? ('llm' as const) : ('deterministic' as const));

  const architectureText = nonEmpty(narrative.architecture);
  const architecture: Sections['architecture'] = architectureText
    ? {
        ...base.architecture,
        source: 'llm',
        narrative: truncateAt(architectureText, ONBOARDING_MAX_NARRATIVE_CHARS),
      }
    : base.architecture;

  const reasonOf = firstBy(narrative.critical_path_reasons, (r) => r.path);
  const critical_paths: Sections['critical_paths'] = {
    ...base.critical_paths,
    source: llmIf(base.critical_paths.unavailable_reason),
    items: base.critical_paths.items.map((item) => {
      const reason = nonEmpty(reasonOf.get(item.path)?.reason);
      return { ...item, reason: reason ? truncateAt(reason, ONBOARDING_MAX_REASON_CHARS) : null };
    }),
  };

  const baseCommands = new Map(base.run_commands.items.map((c) => [c.id, c]));
  const commentOf = firstBy(narrative.commands, (c) => c.id);
  const orderedIds = [...commentOf.keys()].filter((id) => baseCommands.has(id));
  const missingIds = base.run_commands.items.map((c) => c.id).filter((id) => !commentOf.has(id));
  const run_commands: Sections['run_commands'] = {
    ...base.run_commands,
    source: llmIf(base.run_commands.unavailable_reason),
    items: [...orderedIds, ...missingIds].map((id) => {
      const item = baseCommands.get(id)!;
      const comment = nonEmpty(commentOf.get(id)?.comment);
      return { ...item, comment: comment ? truncateAt(comment, ONBOARDING_MAX_COMMAND_COMMENT_CHARS) : item.comment };
    }),
  };

  const whyOf = firstBy(narrative.reading_path, (r) => r.path);
  const reading_path: Sections['reading_path'] = {
    ...base.reading_path,
    source: llmIf(base.reading_path.unavailable_reason),
    items: base.reading_path.items.map((item) => {
      const why = nonEmpty(whyOf.get(item.path)?.why);
      return why
        ? { path: item.path, why: truncateAt(why, ONBOARDING_MAX_REASON_CHARS), why_source: 'llm' as const }
        : item;
    }),
  };

  const tasks: Sections['first_tasks']['items'] = [];
  for (const t of narrative.first_tasks) {
    const paths = [...new Set(t.paths.filter((p) => known.has(p)))];
    const title = nonEmpty(t.title);
    if (paths.length === 0 || !title) continue;
    tasks.push({
      title: truncateAt(title, ONBOARDING_MAX_TASK_TITLE_CHARS),
      description: truncateAt(t.description.trim(), ONBOARDING_MAX_TASK_DESCRIPTION_CHARS),
      paths,
    });
    if (tasks.length >= ONBOARDING_MAX_FIRST_TASKS) break;
  }
  const first_tasks: Sections['first_tasks'] =
    tasks.length > 0
      ? { source: 'llm', unavailable_reason: null, items: tasks }
      : { source: 'deterministic', unavailable_reason: 'invalid_output', items: [] };

  return { architecture, critical_paths, run_commands, reading_path, first_tasks };
}

/** ready = every section from the model and available; skeleton = no narrative; else partial. */
export function tourStatus(sections: Sections, hasNarrative: boolean): OnboardingTour['status'] {
  if (!hasNarrative) return 'skeleton';
  const all = Object.values(sections) as { source: string; unavailable_reason: string | null }[];
  return all.every((s) => s.source === 'llm' && s.unavailable_reason === null) ? 'ready' : 'partial';
}

export interface StaleResult {
  stale: boolean;
  stale_reason: 'index_moved' | 'prompt_changed' | null;
}

/** A tour is stale when the index moved on (wins) or the prompt version changed. '' = no index state. */
export function deriveStale(
  tour: { index_sha: string | null; prompt_version: string },
  indexState: { lastIndexedSha: string } | null,
  currentPromptVersion: string,
): StaleResult {
  if (indexState && indexState.lastIndexedSha !== '' && indexState.lastIndexedSha !== tour.index_sha) {
    return { stale: true, stale_reason: 'index_moved' };
  }
  if (tour.prompt_version !== currentPromptVersion) return { stale: true, stale_reason: 'prompt_changed' };
  return { stale: false, stale_reason: null };
}

export interface DoneLineInput {
  repoId: string;
  status: string;
  llmCalls: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  durationMs: number;
  reasons: readonly string[];
  dropped: readonly string[];
}

/** The single content-free `onboarding: done` log line (AC-20). */
export function formatDoneLine(i: DoneLineInput): string {
  const parts = [
    'onboarding: done',
    `repo=${i.repoId}`,
    `status=${i.status}`,
    `llm_calls=${i.llmCalls}`,
    `tokens_in=${i.tokensIn}`,
    `tokens_out=${i.tokensOut}`,
    `cost_usd=${i.costUsd === null ? 'null' : i.costUsd}`,
    `duration_ms=${i.durationMs}`,
    `reasons=${i.reasons.length > 0 ? i.reasons.join(',') : '-'}`,
  ];
  if (i.dropped.length > 0) parts.push(`dropped=${i.dropped.join(',')}`);
  return parts.join(' ');
}

const STACK_MARKERS: readonly [string, string][] = [
  ['next', 'Next.js'],
  ['react', 'React'],
  ['vue', 'Vue'],
  ['svelte', 'Svelte'],
  ['fastify', 'Fastify'],
  ['express', 'Express'],
  ['@nestjs/core', 'NestJS'],
  ['drizzle-orm', 'Drizzle ORM'],
  ['prisma', 'Prisma'],
  ['pg', 'PostgreSQL'],
  ['postgres', 'PostgreSQL'],
  ['tailwindcss', 'Tailwind CSS'],
  ['vitest', 'Vitest'],
  ['jest', 'Jest'],
  ['typescript', 'TypeScript'],
];

/** Stack labels from dependency names (fixed marker table, deduplicated, stable order). */
export function detectStack(dependencies: readonly string[]): string[] {
  const deps = new Set(dependencies);
  return [...new Set(STACK_MARKERS.filter(([dep]) => deps.has(dep)).map(([, label]) => label))];
}
