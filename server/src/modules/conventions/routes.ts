import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  ConventionCandidate,
  ConventionScan,
  ConventionSkillDraft,
  ConventionSkillDraftRequest,
  ConventionsState,
  CreateConventionSkillBody,
  CreateConventionSkillResult,
  UpdateConventionBody,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { ConventionsService } from './service.js';
import { EXTRACT_RATE_LIMIT } from './constants.js';

/**
 * L03 — conventions → skill.
 *   GET   /repos/:id/conventions              → ConventionsState (rejected excluded)
 *   POST  /repos/:id/conventions/extract      → 202 ConventionScan (running); 409 running; 422 unindexed
 *   PATCH /conventions/:id                    → accept / reject / inline edit
 *   POST  /repos/:id/conventions/skill-draft  → editable skill draft from accepted candidates
 *   POST  /repos/:id/conventions/skill        → 201 create skill (+ optional agent link)
 */
export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService(app.container, app.log);

  // Let in-flight background scans finish before the DB pool goes away.
  app.addHook('onClose', async () => {
    await service.settle();
  });

  app.get(
    '/repos/:id/conventions',
    { schema: { params: IdParams, response: { 200: ConventionsState } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.state(workspaceId, req.params.id);
    },
  );

  app.post(
    '/repos/:id/conventions/extract',
    {
      schema: { params: IdParams, response: { 202: ConventionScan } },
      config: { rateLimit: EXTRACT_RATE_LIMIT },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const scan = await service.startExtract(workspaceId, req.params.id);
      reply.status(202);
      return scan;
    },
  );

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: UpdateConventionBody, response: { 200: ConventionCandidate } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const candidate = await service.update(workspaceId, req.params.id, req.body);
      if (!candidate) throw new NotFoundError('Convention not found');
      return candidate;
    },
  );

  app.post(
    '/repos/:id/conventions/skill-draft',
    { schema: { params: IdParams, body: ConventionSkillDraftRequest, response: { 200: ConventionSkillDraft } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.skillDraft(workspaceId, req.params.id, req.body.candidate_ids);
    },
  );

  app.post(
    '/repos/:id/conventions/skill',
    { schema: { params: IdParams, body: CreateConventionSkillBody, response: { 201: CreateConventionSkillResult } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const result = await service.createSkill(workspaceId, req.params.id, req.body);
      reply.status(201);
      return result;
    },
  );
}
