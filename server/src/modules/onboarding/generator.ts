import { randomUUID } from 'node:crypto';
import {
  OnboardingNarrative,
  type GitClient,
  type LLMProvider,
  type OnboardingReason,
  type OnboardingTour,
} from '@devdigest/shared';
import {
  buildOnboardingMessages,
  ONBOARDING_PROMPT_VERSION,
  type OnboardingFacts,
} from '@devdigest/reviewer-core';
import type { RepoIntel } from '../repo-intel/types.js';
import { buildPromptAssembledEvent, makeMeter, type PromptAssembledEvent } from '../../platform/prompt-log.js';
import type { Tokenizer } from '../../adapters/tokenizer/index.js';
import { ConfigError } from '../../platform/errors.js';
import { TimeoutError } from '../../platform/resilience.js';
import { readCloneFacts, type CloneFacts } from './facts.js';
import { buildDeterministicSections } from './sections.js';
import { deriveCommands, detectStack, formatDoneLine, mergeNarrative, tourStatus } from './helpers.js';
import {
  ONBOARDING_MAX_INPUT_TOKENS,
  ONBOARDING_MAX_OUTPUT_TOKENS,
  ONBOARDING_MAX_PROMPT_SYMBOL_FILES,
  ONBOARDING_TEMPERATURE,
  ONBOARDING_TIMEOUT_MS,
} from './constants.js';

/**
 * Onboarding generator: deterministic facts -> ONE narrative request (no reprompt, no transport
 * retry) -> merged tour. Never throws for an expected failure: it returns a skeleton plus the
 * failure reason. `deps.log` and `deps.promptLog` are its only logging channels and receive
 * content-free records (manifest + one summary line).
 */

type Sections = OnboardingTour['sections'];

export interface GeneratorDeps {
  repoIntel: Pick<
    RepoIntel,
    'getIndexState' | 'getOnboardingGraph' | 'getAllFileFacts' | 'getCriticalPaths' | 'getRepoMap' | 'getSymbolsInFiles'
  >;
  git: GitClient;
  resolveModel(feature: 'onboarding'): Promise<{ provider: 'openai' | 'anthropic' | 'openrouter'; model: string }>;
  /** Resolves a no-retry provider; rejects with ConfigError when no key is configured. */
  llm(provider: 'openai' | 'anthropic' | 'openrouter'): Promise<LLMProvider>;
  tokenizer: Tokenizer;
  log(line: string): void;
  promptLog(event: PromptAssembledEvent): void;
  /** Epoch milliseconds. */
  now(): number;
  verbose?: boolean;
}

export interface GeneratorInput {
  repo: { id: string; owner: string; name: string; fullName: string };
  workspaceId: string;
}

export interface GeneratorResult {
  tour: OnboardingTour;
  failure: OnboardingReason | null;
}

const EMPTY_FACTS: CloneFacts = {
  readme: null,
  envNames: [],
  hasEnvExample: false,
  packageManager: 'npm',
  hasRootPackageJson: false,
  scripts: [],
  dependencies: [],
  composeServices: [],
  makeTargets: [],
};

function failureReason(err: unknown): OnboardingReason {
  if (err instanceof ConfigError) return 'no_api_key';
  if (err instanceof TimeoutError) return 'llm_timeout';
  const message = err instanceof Error ? err.message : '';
  if (message.includes('failed schema')) return 'invalid_output';
  return 'llm_error';
}

const unique = <T>(items: readonly T[]): T[] => [...new Set(items)];

export async function generateOnboarding(input: GeneratorInput, deps: GeneratorDeps): Promise<GeneratorResult> {
  const { repo } = input;
  const startedAt = deps.now();
  const ref = { owner: repo.owner, name: repo.name };

  // ---- deterministic facts (no LLM) -------------------------------------------------
  const indexState = await deps.repoIntel.getIndexState(repo.id);
  const hasIndexState = indexState.lastIndexedSha !== '';
  const [graph, fileFacts, chains] = await Promise.all([
    deps.repoIntel.getOnboardingGraph(repo.id),
    deps.repoIntel.getAllFileFacts(repo.id),
    deps.repoIntel.getCriticalPaths(repo.id),
  ]);
  const topDirs = unique(graph.files.filter((f) => f.path.includes('/')).map((f) => f.path.split('/')[0]!));
  const facts = await readCloneFacts(deps.git, ref, topDirs).catch(() => EMPTY_FACTS);
  const commands = deriveCommands(facts);
  const stack = detectStack(facts.dependencies);

  const det = buildDeterministicSections({
    graph,
    fileFacts,
    chains,
    stack,
    services: facts.composeServices,
    index: {
      status: indexState.status as 'full' | 'partial' | 'degraded' | 'failed',
      filesIndexed: indexState.filesIndexed,
      filesTotal: indexState.filesTotal ?? null,
      bounded: indexState.bounded ?? 0,
    },
    indexEnabled: true,
  });
  const base: Sections = {
    ...det.sections,
    run_commands: { source: 'deterministic', unavailable_reason: null, items: commands },
    first_tasks: { source: 'deterministic', unavailable_reason: null, items: [] },
  };

  // ---- prompt -------------------------------------------------------------------------
  const model = await deps.resolveModel('onboarding');
  const promptPaths = unique([
    ...base.reading_path.items.map((i) => i.path),
    ...base.critical_paths.items.map((i) => i.path),
  ]).slice(0, ONBOARDING_MAX_PROMPT_SYMBOL_FILES);
  const [repoMap, symbolRows] = await Promise.all([
    deps.repoIntel.getRepoMap(repo.id).catch(() => null),
    promptPaths.length > 0 ? deps.repoIntel.getSymbolsInFiles(repo.id, promptPaths) : Promise.resolve([]),
  ]);
  const rankOf = new Map(graph.files.map((f) => [f.path, f.rank]));
  const signaturesByFile = new Map<string, string[]>();
  for (const s of symbolRows) {
    if (s.signature) signaturesByFile.set(s.file, [...(signaturesByFile.get(s.file) ?? []), s.signature]);
  }
  const promptFacts: OnboardingFacts = {
    repo: repo.fullName,
    stack,
    readme: facts.readme,
    repoMap: repoMap && repoMap.text ? repoMap.text : null,
    commands: commands.map((c) => ({ id: c.id, command: c.command })),
    readingPath: base.reading_path.items.map((i) => ({ path: i.path })),
    criticalPaths: base.critical_paths.items.map((i) => ({ path: i.path, fact: i.fact })),
    symbols: [...signaturesByFile].map(([path, signatures]) => ({ path, rank: rankOf.get(path) ?? 0, signatures })),
    endpoints: fileFacts.flatMap((f) => f.endpoints.map((route) => ({ path: f.path, route }))),
  };
  const verbose = deps.verbose ?? false;
  const prompt = buildOnboardingMessages(promptFacts, makeMeter(deps.tokenizer, verbose), {
    maxInputTokens: ONBOARDING_MAX_INPUT_TOKENS,
  });
  deps.promptLog(
    buildPromptAssembledEvent(
      {
        correlationId: randomUUID(),
        repoId: repo.id,
        provider: model.provider,
        model: model.model,
        promptKind: 'onboarding',
        promptVersion: ONBOARDING_PROMPT_VERSION,
        sections: prompt.sections,
      },
      { verbose },
    ),
  );

  // ---- the one request ------------------------------------------------------------------
  let narrative: OnboardingNarrative | null = null;
  let failure: OnboardingReason | null = null;
  let llmCalls = 0;
  let tokensIn = 0;
  let tokensOut = 0;
  let costUsd: number | null = 0;
  try {
    const provider = await deps.llm(model.provider);
    llmCalls = 1;
    try {
      const result = await provider.completeStructured({
        model: model.model,
        schema: OnboardingNarrative,
        schemaName: 'OnboardingNarrative',
        messages: prompt.messages,
        temperature: ONBOARDING_TEMPERATURE,
        maxTokens: ONBOARDING_MAX_OUTPUT_TOKENS,
        timeoutMs: ONBOARDING_TIMEOUT_MS,
        maxRetries: 0,
      });
      narrative = result.data;
      tokensIn = result.tokensIn;
      tokensOut = result.tokensOut;
      costUsd = result.costUsd ?? null;
    } catch (err) {
      failure = failureReason(err);
      costUsd = null;
    }
  } catch (err) {
    // Resolving the provider failed (no key): no request was made.
    failure = failureReason(err);
  }

  // ---- merge ------------------------------------------------------------------------------
  const sections = mergeNarrative({ base, knownPaths: det.known_paths, narrative, failure });
  const status = tourStatus(sections, narrative !== null);
  const reasons = unique<OnboardingReason>([
    ...det.reasons,
    ...(prompt.dropped.length > 0 ? (['budget_trimmed'] as const) : []),
    ...(failure ? [failure] : []),
  ]);
  const durationMs = Math.max(0, Math.round(deps.now() - startedAt));
  const tour: OnboardingTour = {
    status,
    index_sha: hasIndexState ? indexState.lastIndexedSha : null,
    prompt_version: ONBOARDING_PROMPT_VERSION,
    generated_at: new Date(deps.now()).toISOString(),
    coverage: det.coverage,
    reasons,
    known_paths: det.known_paths,
    generation: {
      provider: model.provider,
      model: model.model,
      llm_calls: llmCalls,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd: costUsd,
      duration_ms: durationMs,
    },
    sections,
  };
  deps.log(
    formatDoneLine({
      repoId: repo.id,
      status,
      llmCalls,
      tokensIn,
      tokensOut,
      costUsd,
      durationMs,
      reasons,
      dropped: prompt.dropped,
    }),
  );
  return { tour, failure };
}
