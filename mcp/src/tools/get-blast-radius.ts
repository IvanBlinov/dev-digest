import { presentBlast } from '../presenters/blast';
import { ok, runTool } from './tool-result';
import type { Services } from './registry';
import type { z } from 'zod';
import { prLabel } from './label';
import { GetBlastRadiusInput } from './schemas';

export const definition = {
  name: 'get_blast_radius',
  config: {
    title: 'Get PR blast radius',
    description:
      'Get what else a PR can break: changed symbols, their callers (file:line), and the endpoints and crons behind them. Call before approving or editing a PR. Read-only, from the repo index; optional file limits it to one changed file.',
    inputSchema: GetBlastRadiusInput.shape,
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
};

export const handler = (services: Services) => (args: z.infer<typeof GetBlastRadiusInput>) =>
  runTool(async () => {
    const res = await services.blast.get({ repo: args.repo, prNumber: args.pr_number, file: args.file });
    return ok(presentBlast(res.view, prLabel(res.pr)));
  });
