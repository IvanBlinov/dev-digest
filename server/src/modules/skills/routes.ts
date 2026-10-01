import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CreateSkillBody,
  SkillImportCommit,
  SkillImportRequest,
  UpdateSkillBody,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { SkillsService } from './service.js';
import { IMPORT_BODY_LIMIT } from './constants.js';

/** `/skills/:id/versions/:version/restore` — uuid + positive integer. */
const VersionParams = z.object({
  id: z.string().uuid(),
  version: z.coerce.number().int().positive(),
});

/** Parsing zips is CPU work — cap it tighter than the global limit. */
const IMPORT_RATE_LIMIT = { max: 30, timeWindow: '1 minute' };

/**
 * L02 — skills module.
 *   GET    /skills                              → list (name asc, with agent_count)
 *   GET    /skills/:id                          → one skill
 *   POST   /skills                              → create (manual, v1) — 201
 *   PUT    /skills/:id                          → partial update (content change → new version)
 *   DELETE /skills/:id                          → delete (links + versions cascade)
 *   GET    /skills/:id/versions                 → versions, newest first
 *   POST   /skills/:id/versions/:version/restore → new version with the old body
 *   POST   /skills/import/preview               → parse an upload (nothing saved)
 *   POST   /skills/import                       → parse + save (source imported) — 201
 */
export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SkillsService(app.container);

  app.get('/skills', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.post(
    '/skills/import/preview',
    {
      schema: { body: SkillImportRequest },
      bodyLimit: IMPORT_BODY_LIMIT,
      config: { rateLimit: IMPORT_RATE_LIMIT },
    },
    async (req) => {
      await getContext(app.container, req);
      return service.previewImport(req.body);
    },
  );

  app.post(
    '/skills/import',
    {
      schema: { body: SkillImportCommit },
      bodyLimit: IMPORT_BODY_LIMIT,
      config: { rateLimit: IMPORT_RATE_LIMIT },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.commitImport(workspaceId, req.body);
      reply.status(201);
      return skill;
    },
  );

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.get(workspaceId, req.params.id);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.post('/skills', { schema: { body: CreateSkillBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.create(workspaceId, req.body);
    reply.status(201);
    return skill;
  });

  app.put('/skills/:id', { schema: { params: IdParams, body: UpdateSkillBody } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.update(workspaceId, req.params.id, req.body);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.delete(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Skill not found');
    return { ok: true };
  });

  app.get('/skills/:id/versions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const versions = await service.listVersions(workspaceId, req.params.id);
    if (!versions) throw new NotFoundError('Skill not found');
    return versions;
  });

  app.post(
    '/skills/:id/versions/:version/restore',
    { schema: { params: VersionParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.restore(workspaceId, req.params.id, req.params.version);
    },
  );
}
