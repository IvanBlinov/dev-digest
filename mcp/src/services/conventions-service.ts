import type { DevDigestApi } from '../api/port';
import { conventionsView, type ConventionsView } from '../domain/conventions';
import type { PrResolver } from './pr-resolver';

export interface GetConventionsInput {
  repo: string;
  limit: number;
}

/** Read-only by construction: this service has no way to start an extraction. */
export class ConventionsService {
  constructor(
    private readonly api: DevDigestApi,
    private readonly resolver: PrResolver,
  ) {}

  async get(input: GetConventionsInput): Promise<ConventionsView> {
    const repo = await this.resolver.resolveRepo(input.repo);
    return conventionsView(await this.api.getConventions(repo.id), input.limit);
  }
}
