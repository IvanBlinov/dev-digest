import type { SmartDiffResponse } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { ReviewRepository } from '../reviews/repository.js';
import { activeFindings, pickLatestPerAgent } from '../reviews/severity.js';
import { buildSmartDiff } from './helpers.js';

/** Reviewer-ordered file groups for a PR. Read-only, no LLM: pure grouping over stored rows. */
export class SmartDiffService {
  private reviews: ReviewRepository;

  constructor(container: Container) {
    this.reviews = new ReviewRepository(container.db);
  }

  async get(workspaceId: string, prId: string): Promise<SmartDiffResponse> {
    const pull = await this.reviews.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const files = await this.reviews.getPrFiles(pull.id);
    const rows = await this.reviews.reviewsForPull(pull.id);

    // "The PR's findings" = newest review of each agent (the PR header counters' rule), kinds other
    // than 'review' (summaries) excluded, dismissed findings dropped.
    const latest = pickLatestPerAgent(rows.filter((r) => r.review.kind === 'review').map((r) => r.review));
    const latestIds = new Set(latest.map((r) => r.id));
    const findings = activeFindings(rows.filter((r) => latestIds.has(r.review.id)).flatMap((r) => r.findings));

    return buildSmartDiff(
      files,
      findings.map((f) => ({ file: f.file, start_line: f.startLine })),
    );
  }
}
