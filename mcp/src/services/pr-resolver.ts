import type { PrMeta, Repo } from '@devdigest/shared';
import type { DevDigestApi } from '../api/port';
import { matchPr, matchRepo } from '../domain/match';
import { PrNotImportedError, RepoNotFoundError } from '../domain/errors';

/** `GET /repos/:id/pulls` syncs from GitHub on the server, so resolutions are cached. */
export const PR_CACHE_TTL_MS = 10 * 60 * 1000;

export interface ResolvedPr {
  repo: { id: string; fullName: string };
  pr: { id: string; number: number; title: string };
}

interface Cached<T> {
  at: number;
  value: T;
}

export class PrResolver {
  private repos: Cached<Repo[]> | null = null;
  private pulls = new Map<string, Cached<PrMeta[]>>();

  constructor(
    private readonly api: DevDigestApi,
    private readonly clock: () => number,
  ) {}

  async resolveRepo(fullName: string): Promise<{ id: string; fullName: string }> {
    const cached = this.fresh(this.repos);
    if (cached) {
      try {
        return toRepoRef(matchRepo(cached, fullName));
      } catch (e) {
        // The repo may have just been added in the UI: refetch exactly once.
        if (!(e instanceof RepoNotFoundError)) throw e;
      }
    }
    const list = await this.api.listRepos();
    this.repos = { at: this.clock(), value: list };
    return toRepoRef(matchRepo(list, fullName));
  }

  async resolve(repoFullName: string, prNumber: number): Promise<ResolvedPr> {
    const repo = await this.resolveRepo(repoFullName);
    const cached = this.fresh(this.pulls.get(repo.id) ?? null);
    if (cached) {
      try {
        return toResolved(repo, matchPr(cached, repo.fullName, prNumber));
      } catch (e) {
        // The PR may have just been imported: refetch exactly once.
        if (!(e instanceof PrNotImportedError)) throw e;
      }
    }
    const list = await this.api.listPulls(repo.id);
    this.pulls.set(repo.id, { at: this.clock(), value: list });
    return toResolved(repo, matchPr(list, repo.fullName, prNumber));
  }

  private fresh<T>(entry: Cached<T> | null): T | null {
    return entry && this.clock() - entry.at < PR_CACHE_TTL_MS ? entry.value : null;
  }
}

function toRepoRef(r: Repo): { id: string; fullName: string } {
  return { id: r.id, fullName: r.full_name };
}

function toResolved(repo: { id: string; fullName: string }, p: PrMeta & { id: string }): ResolvedPr {
  return { repo, pr: { id: p.id, number: p.number, title: p.title } };
}
