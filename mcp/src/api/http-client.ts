import type {
  Agent,
  ApiErrorBody,
  ConventionsState,
  PrMeta,
  Repo,
  ReviewRecord,
  ReviewRunResponse,
  RunRequest,
  RunSummary,
} from '@devdigest/shared';
import type { Config } from '../config';
import { ApiError, ApiTimeoutError, ApiUnreachableError } from './errors';
import type { DevDigestApi } from './port';

type FetchImpl = (url: string | URL, init?: RequestInit) => Promise<Response>;

function isTimeout(e: unknown): boolean {
  const name = (e as { name?: string } | null)?.name;
  return name === 'TimeoutError' || name === 'AbortError';
}

/** Edge adapter: HTTP + error mapping only, no business decisions. */
export class HttpDevDigestApi implements DevDigestApi {
  constructor(
    private readonly config: Pick<Config, 'apiUrl' | 'timeoutMs'>,
    private readonly fetchImpl: FetchImpl = fetch,
  ) {}

  listRepos(): Promise<Repo[]> {
    return this.request('GET', '/repos');
  }
  listPulls(repoId: string): Promise<PrMeta[]> {
    return this.request('GET', `/repos/${encodeURIComponent(repoId)}/pulls`);
  }
  listAgents(): Promise<Agent[]> {
    return this.request('GET', '/agents');
  }
  startReview(prId: string, body: RunRequest): Promise<ReviewRunResponse> {
    return this.request('POST', `/pulls/${encodeURIComponent(prId)}/review`, body);
  }
  listRuns(prId: string): Promise<RunSummary[]> {
    return this.request('GET', `/pulls/${encodeURIComponent(prId)}/runs`);
  }
  listReviews(prId: string): Promise<ReviewRecord[]> {
    return this.request('GET', `/pulls/${encodeURIComponent(prId)}/reviews`);
  }
  getConventions(repoId: string): Promise<ConventionsState> {
    return this.request('GET', `/repos/${encodeURIComponent(repoId)}/conventions`);
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.config.apiUrl}${path}`, {
        method,
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (e) {
      if (isTimeout(e)) throw new ApiTimeoutError(this.config.timeoutMs);
      throw new ApiUnreachableError(this.config.apiUrl);
    }

    if (!res.ok) throw await this.toApiError(res);
    try {
      return (await res.json()) as T;
    } catch {
      throw new ApiError(res.status, 'invalid_response', 'DevDigest API returned a non-JSON body');
    }
  }

  /** Carries only status/code/message; the envelope's `details` is deliberately dropped. */
  private async toApiError(res: Response): Promise<ApiError> {
    const fallback = new ApiError(res.status, `http_${res.status}`, `HTTP ${res.status}`);
    try {
      const parsed = (await res.json()) as Partial<ApiErrorBody>;
      const env = parsed?.error;
      if (env && typeof env.code === 'string' && typeof env.message === 'string') {
        return new ApiError(res.status, env.code, env.message);
      }
    } catch {
      // non-JSON body: fall through
    }
    return fallback;
  }
}
