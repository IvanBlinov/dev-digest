import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { OnboardingGenerateResponse, OnboardingTourState } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { OnboardingService } from './service.js';
import { ONBOARDING_GENERATE_RATE_LIMIT } from './constants.js';

/**
 * L05b — onboarding tour.
 *   GET   /repos/:id/onboarding           → OnboardingTourState (side-effect free)
 *   POST  /repos/:id/onboarding/generate  → 202 {status:'generating'}; 409 running / not cloned; 429
 */
export default async function onboardingRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new OnboardingService(app.container, app.log);

  // Let in-flight background generations finish before the DB pool goes away.
  app.addHook('onClose', async () => {
    await service.settle();
  });

  app.get(
    '/repos/:id/onboarding',
    { schema: { params: IdParams, response: { 200: OnboardingTourState } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.state(workspaceId, req.params.id);
    },
  );

  app.post(
    '/repos/:id/onboarding/generate',
    {
      schema: { params: IdParams, response: { 202: OnboardingGenerateResponse } },
      config: { rateLimit: { max: ONBOARDING_GENERATE_RATE_LIMIT, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const res = await service.generate(workspaceId, req.params.id);
      reply.status(202);
      return res;
    },
  );
}
