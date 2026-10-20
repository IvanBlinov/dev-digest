import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ContextFileQuery, PutContextAttachmentsBody } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ProjectContextService } from './service.js';

/**
 * L05 — project-context module. Transport only: validate, delegate, return.
 *   GET /repos/:id/context           → matching documents (no content)
 *   GET /repos/:id/context/file?path → one document's full text
 *   GET|PUT /agents/:id/context      → ordered attached paths
 *   GET|PUT /skills/:id/context      → ordered attached paths
 *   GET /context/attachments         → workspace-wide usage (agents with inherited, skills)
 */
export default async function projectContextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ProjectContextService(app.container);

  app.get('/repos/:id/context', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.listing(workspaceId, req.params.id);
  });

  app.get(
    '/repos/:id/context/file',
    { schema: { params: IdParams, querystring: ContextFileQuery } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.file(workspaceId, req.params.id, req.query.path);
    },
  );

  app.get('/agents/:id/context', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.agentPaths(workspaceId, req.params.id);
  });

  app.put(
    '/agents/:id/context',
    { schema: { params: IdParams, body: PutContextAttachmentsBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.setAgentPaths(workspaceId, req.params.id, req.body.paths);
    },
  );

  app.get('/skills/:id/context', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.skillPaths(workspaceId, req.params.id);
  });

  app.put(
    '/skills/:id/context',
    { schema: { params: IdParams, body: PutContextAttachmentsBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.setSkillPaths(workspaceId, req.params.id, req.body.paths);
    },
  );

  app.get('/context/attachments', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.workspaceAttachments(workspaceId);
  });
}
