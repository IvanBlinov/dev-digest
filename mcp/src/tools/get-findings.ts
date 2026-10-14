import { presentFindings } from '../presenters/findings';
import { presentRunStatus } from '../presenters/reviews';
import { ok, runTool } from './tool-result';
import type { Services } from './registry';
import type { z } from 'zod';
import { prLabel } from './label';
import { GetFindingsInput } from './schemas';

export const definition = {
  name: 'get_findings',
  config: {
    title: 'Get review findings',
    description:
      'Get DevDigest review findings for a pull request, or the status of a review still running. Pass run_id from run_review for one run; omit it for the latest review of each agent. Filter by severity_min; page with offset.',
    inputSchema: GetFindingsInput.shape,
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
};

export const handler = (services: Services) => (args: z.infer<typeof GetFindingsInput>) =>
  runTool(async () => {
    const res = await services.reviews.findings({
      repo: args.repo,
      prNumber: args.pr_number,
      runId: args.run_id,
      severityMin: args.severity_min,
      limit: args.limit,
      offset: args.offset,
    });
    const label = prLabel(res.pr);
    if (res.kind === 'pr') {
      return ok(presentFindings({ label, reviews: res.reviews, running: res.running, page: res.page }, args.response_format));
    }
    if (res.outcome.status !== 'done') {
      return ok(presentRunStatus({ label, runId: res.runId, agentName: res.agentName, outcome: res.outcome }));
    }
    return ok(
      presentFindings(
        { label, reviews: res.reviews, running: [], page: res.page },
        args.response_format,
      ),
    );
  });
