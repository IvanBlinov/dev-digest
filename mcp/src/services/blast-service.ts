import type { DevDigestApi } from '../api/port';
import { blastView, type BlastView } from '../domain/blast';
import type { PrResolver, ResolvedPr } from './pr-resolver';

export interface GetBlastInput {
  repo: string;
  prNumber: number;
  file?: string | undefined;
}

export interface BlastResult {
  pr: ResolvedPr;
  view: BlastView;
}

/** Read-only: resolves the PR and reads its blast radius once. */
export class BlastService {
  constructor(
    private readonly api: DevDigestApi,
    private readonly resolver: PrResolver,
  ) {}

  async get(input: GetBlastInput): Promise<BlastResult> {
    const pr = await this.resolver.resolve(input.repo, input.prNumber);
    return { pr, view: blastView(await this.api.getBlastRadius(pr.pr.id), input.file) };
  }
}
