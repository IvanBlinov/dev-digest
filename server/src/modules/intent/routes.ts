import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrIntentResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { DETECT_RATE_LIMIT } from './constants.js';
import { IntentService } from './service.js';

/**
 * Intent layer.
 *   GET  /pulls/:id/intent → the stored intent (+ stale flag), or { intent: null }
 *   POST /pulls/:id/intent → (re)classify now with the review_intent model
 */
export default async function intentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new IntentService(app.container);

  app.get(
    '/pulls/:id/intent',
    { schema: { params: IdParams, response: { 200: PrIntentResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.get(workspaceId, req.params.id);
    },
  );

  // Tight limit: every call is a paid LLM request plus up to 6 GitHub reads.
  app.post(
    '/pulls/:id/intent',
    {
      schema: { params: IdParams, response: { 200: PrIntentResponse } },
      config: { rateLimit: DETECT_RATE_LIMIT },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.detect(workspaceId, req.params.id, req.log);
    },
  );
}
