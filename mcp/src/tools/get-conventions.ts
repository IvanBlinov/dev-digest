import { presentConventions } from '../presenters/conventions';
import { ok, runTool } from './tool-result';
import type { Services } from './registry';
import type { z } from 'zod';
import { GetConventionsInput } from './schemas';

export const definition = {
  name: 'get_conventions',
  config: {
    title: 'Get repo conventions',
    description:
      'Get the coding conventions DevDigest extracted for a repo (rules with evidence file:line). Read-only: never starts an extraction. Use before writing or reviewing code in that repo.',
    inputSchema: GetConventionsInput.shape,
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
};

export const handler = (services: Services) => (args: z.infer<typeof GetConventionsInput>) =>
  runTool(async () =>
    ok(presentConventions(await services.conventions.get({ repo: args.repo, limit: args.limit }), args.response_format)),
  );
