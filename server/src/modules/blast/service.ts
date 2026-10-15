import type { BlastRadius } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { ReviewRepository } from '../reviews/repository.js';
import { toBlastRadius } from './helpers.js';

/** Minimal pino-compatible logger the HTTP route passes (`req.log`). */
export type PinoLike = {
  info: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};

/**
 * Blast radius of a PR: symbols declared in the changed files, their callers and the endpoints/crons
 * behind them. Read-only over the repo-intel index; no re-parse, no LLM.
 */
export class BlastService {
  private reviews: ReviewRepository;

  constructor(private container: Container) {
    this.reviews = new ReviewRepository(container.db);
  }

  async get(workspaceId: string, prId: string, logger?: PinoLike): Promise<BlastRadius> {
    const pull = await this.reviews.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const files = await this.reviews.getPrFiles(pull.id);
    const result = await this.container.repoIntel.getBlastRadius(
      pull.repoId,
      files.map((f) => f.path),
    );
    const radius = toBlastRadius(result);

    // Counts only: symbol names and paths are repo text and stay out of logs.
    logger?.info(
      {
        prId,
        files: files.length,
        symbols: radius.changed_symbols.length,
        callers: radius.downstream.reduce((n, d) => n + d.callers.length, 0),
        degraded: radius.degraded,
        reason: radius.reason,
      },
      'blast: read repo-intel index',
    );
    return radius;
  }
}
