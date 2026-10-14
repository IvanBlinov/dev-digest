import type {
  Agent,
  ConventionsState,
  PrMeta,
  Repo,
  ReviewRecord,
  ReviewRunResponse,
  RunRequest,
  RunSummary,
} from '@devdigest/shared';

/** The slice of the DevDigest HTTP API that the MCP server uses. */
export interface DevDigestApi {
  listRepos(): Promise<Repo[]>;
  listPulls(repoId: string): Promise<PrMeta[]>;
  listAgents(): Promise<Agent[]>;
  startReview(prId: string, body: RunRequest): Promise<ReviewRunResponse>;
  listRuns(prId: string): Promise<RunSummary[]>;
  listReviews(prId: string): Promise<ReviewRecord[]>;
  getConventions(repoId: string): Promise<ConventionsState>;
}
