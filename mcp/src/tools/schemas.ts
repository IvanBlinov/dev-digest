import { z } from 'zod';

export const RepoField = z
  .string()
  .regex(/^[\w.-]+\/[\w.-]+$/, 'must look like owner/name')
  .describe('GitHub repo as owner/name, already added in DevDigest');

export const PrNumberField = z.number().int().min(1).describe('Pull request number');

export const ResponseFormatField = z
  .enum(['concise', 'detailed'])
  .default('concise')
  .describe('concise = one line per item; detailed adds rationale/evidence');

export const ListAgentsInput = z.object({}).strict();

export const RunReviewInput = z
  .object({
    repo: RepoField,
    pr_number: PrNumberField,
    agent: z.string().min(1).optional().describe('Agent name or id from list_agents; omit = all enabled'),
  })
  .strict();

export const GetFindingsInput = z
  .object({
    repo: RepoField,
    pr_number: PrNumberField,
    run_id: z.string().uuid().optional().describe('run_id from run_review; omit = latest review of each agent'),
    severity_min: z
      .enum(['CRITICAL', 'WARNING', 'SUGGESTION'])
      .default('SUGGESTION')
      .describe('Lowest severity to include'),
    limit: z.number().int().min(1).max(50).default(20).describe('Findings per page'),
    offset: z.number().int().min(0).default(0).describe('Findings to skip'),
    response_format: ResponseFormatField,
  })
  .strict();

export const GetConventionsInput = z
  .object({
    repo: RepoField,
    limit: z.number().int().min(1).max(100).default(30).describe('Conventions to return'),
    response_format: ResponseFormatField,
  })
  .strict();

export const GetBlastRadiusInput = z
  .object({
    repo: RepoField,
    pr_number: PrNumberField,
    file: z.string().optional().describe('Limit to one changed file path'),
  })
  .strict();
