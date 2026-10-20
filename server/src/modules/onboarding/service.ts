import type { OnboardingGenerateResponse, OnboardingReason, OnboardingTour, OnboardingTourState } from '@devdigest/shared';
import { ONBOARDING_PROMPT_VERSION } from '@devdigest/reviewer-core';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { TimeoutError, withTimeout } from '../../platform/resilience.js';
import { PROMPT_ASSEMBLED_MSG } from '../../platform/prompt-log.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { RepoRepository, type RepoRow } from '../repos/repository.js';
import { OnboardingRepository, type OnboardingRow } from './repository.js';
import { generateOnboarding } from './generator.js';
import { deriveStale } from './helpers.js';
import { ONBOARDING_JOB_TIMEOUT_MS, ONBOARDING_STALE_GENERATION_MS } from './constants.js';

/** Minimal logger the background job reports to (Fastify's logger fits). */
export interface OnboardingLogger {
  info(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

const isTour = (json: unknown): json is OnboardingTour =>
  typeof json === 'object' && json !== null && 'status' in json && 'sections' in json;

const STATUSES = new Set<OnboardingTourState['status']>(['none', 'generating', 'ready', 'partial', 'skeleton', 'failed']);

/**
 * L05b — onboarding service. GET is a pure read (it only fails generations whose process died);
 * generation runs as a background promise (never through JobRunner, which would retry the whole
 * handler and multiply LLM requests) and makes exactly one LLM request.
 */
export class OnboardingService {
  private repo: OnboardingRepository;
  private repos: RepoRepository;
  /** In-flight background generations (repo id → promise); awaited by `settle()`. */
  private inflight = new Map<string, Promise<void>>();

  constructor(
    private container: Container,
    private log?: OnboardingLogger,
  ) {
    this.repo = new OnboardingRepository(container.db);
    this.repos = new RepoRepository(container.db);
  }

  async state(workspaceId: string, repoId: string): Promise<OnboardingTourState> {
    const repo = await this.requireRepo(workspaceId, repoId);
    await this.repo.failStale(ONBOARDING_STALE_GENERATION_MS);
    const row = await this.repo.get(repoId);
    const indexState = await this.container.repoIntel.getIndexState(repoId);
    const hasIndex = indexState.lastIndexedSha !== '';
    return toState(row, repo, hasIndex ? indexState : null);
  }

  /** Open a `generating` row and continue in the background. 409 not cloned / already running. */
  async generate(workspaceId: string, repoId: string): Promise<OnboardingGenerateResponse> {
    const repo = await this.requireRepo(workspaceId, repoId);
    await this.repo.failStale(ONBOARDING_STALE_GENERATION_MS);
    if (!repo.clonePath) throw new AppError('repo_not_cloned', 'Repository is not cloned yet', 409);
    const started = await this.repo.startIfIdle(repoId);
    if (!started) throw new AppError('onboarding_generation_running', 'An onboarding generation is already running', 409);

    const job = this.run(workspaceId, repo).finally(() => this.inflight.delete(repoId));
    this.inflight.set(repoId, job);
    return { status: 'generating' };
  }

  /** Resolves once every background generation started by this service has settled. */
  async settle(): Promise<void> {
    await Promise.allSettled([...this.inflight.values()]);
  }

  /** Never rejects: any failure is stored on the row. */
  private async run(workspaceId: string, repo: RepoRow): Promise<void> {
    try {
      const { tour, failure } = await withTimeout(this.runGenerator(workspaceId, repo), ONBOARDING_JOB_TIMEOUT_MS);
      if (failure) await this.repo.finishFailure(repo.id, failure, tour);
      else await this.repo.finishSuccess(repo.id, tour);
    } catch (err) {
      const reason: OnboardingReason = err instanceof TimeoutError ? 'llm_timeout' : 'llm_error';
      this.log?.error({ err, repoId: repo.id }, 'onboarding generation failed');
      await this.repo.finishFailure(repo.id, reason, null).catch((e) => {
        this.log?.error({ err: e, repoId: repo.id }, 'could not mark onboarding failed');
      });
    }
  }

  private runGenerator(workspaceId: string, repo: RepoRow) {
    const c = this.container;
    return generateOnboarding(
      { repo, workspaceId },
      {
        repoIntel: c.repoIntel,
        git: c.git,
        resolveModel: (feature) => resolveFeatureModel(c, workspaceId, feature),
        llm: (provider) => c.llm(provider, { retries: 0 }),
        tokenizer: c.tokenizer,
        log: (line) => this.log?.info(line),
        promptLog: (event) => this.log?.info(event, PROMPT_ASSEMBLED_MSG),
        now: () => Date.now(),
        verbose: c.config.promptLogVerbose,
      },
    );
  }

  private async requireRepo(workspaceId: string, repoId: string): Promise<RepoRow> {
    const repo = await this.repos.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    return repo;
  }
}

function toState(
  row: OnboardingRow | undefined,
  repo: RepoRow,
  indexState: { lastIndexedSha: string; updatedAt: Date } | null,
): OnboardingTourState {
  const status = row && STATUSES.has(row.status as OnboardingTourState['status']) ? (row.status as OnboardingTourState['status']) : 'none';
  const tour = row && isTour(row.json) ? row.json : null;
  const stale = tour
    ? deriveStale(tour, indexState, ONBOARDING_PROMPT_VERSION)
    : { stale: false, stale_reason: null };
  const lastError = row?.lastError as { reason: OnboardingReason; at: string } | null | undefined;
  return {
    status,
    cloned: Boolean(repo.clonePath),
    tour,
    stale: stale.stale,
    stale_reason: stale.stale_reason,
    index_updated_at: indexState ? indexState.updatedAt.toISOString() : null,
    last_error: lastError ?? null,
  };
}
