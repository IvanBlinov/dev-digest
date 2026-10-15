import { presentStarted } from '../presenters/reviews';
import { ok, runTool } from './tool-result';
import type { Services } from './registry';
import type { z } from 'zod';
import { prLabel } from './label';
import { RunReviewInput } from './schemas';

export const definition = {
  name: 'run_review',
  config: {
    title: 'Run AI review on a PR',
    description:
      'Start a DevDigest AI review of a pull request (async; spends LLM tokens). Returns run_ids immediately → poll get_findings with the same repo and pr_number. Omit agent to run all enabled agents.',
    inputSchema: RunReviewInput.shape,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
};

export const handler = (services: Services) => (args: z.infer<typeof RunReviewInput>) =>
  runTool(async () => {
    const started = await services.reviews.start({
      repo: args.repo,
      prNumber: args.pr_number,
      agent: args.agent,
    });
    return ok(presentStarted({ label: prLabel(started.pr), runs: started.runs }));
  });
