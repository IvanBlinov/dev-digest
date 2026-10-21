import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrBriefResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BRIEF_RATE_LIMIT_MAX, BRIEF_RATE_LIMIT_WINDOW } from './constants.js';
import { rateLimitError } from './helpers.js';
import { BriefService } from './service.js';

/**
 * PR Brief.
 *   GET  /pulls/:id/brief → the stored brief (+ stale flag), or { brief: null }; never calls a model
 *   POST /pulls/:id/brief → generate now with the risk_brief model (one request, no retry)
 */
export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new BriefService(app.container);

  app.get('/pulls/:id/brief', { schema: { params: IdParams, response: { 200: PrBriefResponse } } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.get(workspaceId, req.params.id);
  });

  // Tight limit: every call is a paid LLM request plus GitHub reads.
  app.post(
    '/pulls/:id/brief',
    {
      schema: { params: IdParams, response: { 200: PrBriefResponse } },
      config: {
        rateLimit: {
          max: BRIEF_RATE_LIMIT_MAX,
          timeWindow: BRIEF_RATE_LIMIT_WINDOW,
          // Only `retry_after_s` reaches the client (AppError.details is serialised as-is).
          errorResponseBuilder: (_req: unknown, ctx: { ttl: number }) => rateLimitError(ctx.ttl),
        },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.generate(workspaceId, req.params.id, req.log, req.id);
    },
  );
}
