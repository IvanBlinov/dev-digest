import type { Severity } from '@devdigest/shared';
import type { DevDigestApi } from '../api/port';
import { NoEnabledAgentsError, RunNotFoundError } from '../domain/errors';
import {
  ageSeconds,
  classifyRun,
  findingsPage,
  latestReviewPerAgent,
  toReviewSummary,
  type FindingsPage,
  type ReviewSummary,
  type RunOutcome,
  type RunRef,
} from '../domain/findings';
import { matchAgent } from '../domain/match';
import type { PrResolver, ResolvedPr } from './pr-resolver';

export interface StartReviewInput {
  repo: string;
  prNumber: number;
  agent?: string | undefined;
}

export interface StartedReview {
  pr: ResolvedPr;
  runs: { runId: string; agentName: string }[];
}

export interface FindingsInput {
  repo: string;
  prNumber: number;
  runId?: string | undefined;
  severityMin: Severity;
  limit: number;
  offset: number;
}

export type FindingsResult =
  | {
      kind: 'run';
      pr: ResolvedPr;
      runId: string;
      agentName: string;
      outcome: RunOutcome;
      /** Summary of the run's review when done; empty otherwise. */
      reviews: ReviewSummary[];
      page: FindingsPage | null;
    }
  | { kind: 'pr'; pr: ResolvedPr; reviews: ReviewSummary[]; running: RunRef[]; page: FindingsPage | null };

export class ReviewsService {
  constructor(
    private readonly api: DevDigestApi,
    private readonly resolver: PrResolver,
    private readonly clock: () => number,
  ) {}

  async start(input: StartReviewInput): Promise<StartedReview> {
    const pr = await this.resolver.resolve(input.repo, input.prNumber);
    const target = matchAgent(await this.api.listAgents(), input.agent);
    const body = target.kind === 'all' ? { all: true } : { agentId: target.agentId };
    const res = await this.api.startReview(pr.pr.id, body);
    if (res.runs.length === 0) throw new NoEnabledAgentsError();
    return { pr, runs: res.runs.map((r) => ({ runId: r.run_id, agentName: r.agent_name })) };
  }

  async findings(input: FindingsInput): Promise<FindingsResult> {
    const pr = await this.resolver.resolve(input.repo, input.prNumber);
    const runs = await this.api.listRuns(pr.pr.id);
    const now = this.clock();
    const pageOpts = { severityMin: input.severityMin, limit: input.limit, offset: input.offset };

    if (input.runId !== undefined) {
      const run = runs.find((r) => r.run_id === input.runId);
      if (!run) throw new RunNotFoundError(input.runId);
      const base = { kind: 'run' as const, pr, runId: run.run_id, agentName: run.agent_name ?? 'unknown agent' };
      // Only a finished run has a review to fetch; other statuses are answered from the run row.
      if (run.status !== 'done') {
        return { ...base, outcome: classifyRun(run, [], now), reviews: [], page: null };
      }
      const reviews = await this.api.listReviews(pr.pr.id);
      const outcome = classifyRun(run, reviews, now);
      return {
        ...base,
        outcome,
        reviews: outcome.status === 'done' ? [toReviewSummary(outcome.review)] : [],
        page: outcome.status === 'done' ? findingsPage([outcome.review], pageOpts) : null,
      };
    }

    const reviews = latestReviewPerAgent(await this.api.listReviews(pr.pr.id));
    const running: RunRef[] = runs
      .filter((r) => r.status === 'running')
      .map((r) => ({ runId: r.run_id, agentName: r.agent_name ?? 'unknown agent', ageSec: ageSeconds(r.ran_at, now) }));
    return {
      kind: 'pr',
      pr,
      reviews: reviews.map(toReviewSummary),
      running,
      page: reviews.length > 0 ? findingsPage(reviews, pageOpts) : null,
    };
  }
}
