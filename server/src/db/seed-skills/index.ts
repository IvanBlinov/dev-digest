// LAYERING EXCEPTION (seeding only): db/ normally never imports modules/*. The
// seed deliberately reuses the skills import parser + repositories so the seeded
// `api-contract-guard` is genuinely `imported` through the same code path as a
// user upload (and stays in sync with it). Do not copy this into runtime code.
import { readFileSync } from 'node:fs';
import { and, eq } from 'drizzle-orm';
import type { Provider, SkillSource } from '@devdigest/shared';
import type { Db } from '../client.js';
import * as t from '../schema.js';
import { SkillsRepository } from '../../modules/skills/repository.js';
import { AgentsRepository } from '../../modules/agents/repository.js';
import { parseSkillUpload } from '../../modules/skills/import.js';
import { INITIAL_VERSION_MESSAGE, importedMessage } from '../../modules/skills/constants.js';
import { DEMO_PRS } from './demo-prs.js';

/**
 * L02 seed: the Skills Lab demo data. Idempotent — every row is looked up by its
 * natural key (skill name, agent name, PR number) and only created when missing,
 * so user edits survive a re-seed.
 *
 * `api-contract-guard` is created THROUGH the import parser with source
 * `imported` (requirement 16); the other skills are read from their fixture with
 * the same parser but saved as `manual`.
 */

interface SkillFixture {
  file: string;
  source: SkillSource;
}

const SKILL_FIXTURES: readonly SkillFixture[] = [
  { file: 'pr-quality-rubric.md', source: 'manual' },
  { file: 'secret-leakage-gate.md', source: 'manual' },
  { file: 'test-quality-rubric.md', source: 'manual' },
  { file: 'api-contract-guard.md', source: 'imported' },
];

/**
 * Deliberately generic prompts: they never mention branches, boundaries or
 * breaking changes, so the control experiments (req 17/18) show that the
 * linked skill is what makes the difference.
 */
const SKILLED_AGENTS = [
  {
    name: 'Test Quality Reviewer',
    description: 'Reviews the tests that ship with a change. Pair with the test-quality-rubric skill.',
    systemPrompt:
      'You are a senior engineer reviewing a pull-request diff. Report only concrete, actionable problems in the changed lines, each cited by file and line. If the change looks fine, return no findings.',
    skill: 'test-quality-rubric',
  },
  {
    name: 'API Contract Reviewer',
    description: 'Reviews changes to HTTP endpoints. Pair with the api-contract-guard skill.',
    systemPrompt:
      'You are a senior backend engineer reviewing a pull-request diff. Report only concrete, actionable problems in the changed lines, each cited by file and line. If the change looks fine, return no findings.',
    skill: 'api-contract-guard',
  },
] as const;

export interface SkillsLabSeedInput {
  workspaceId: string;
  userId: string;
  repoId: string;
  provider: Provider;
  model: string;
}

export async function seedSkillsLab(db: Db, input: SkillsLabSeedInput): Promise<void> {
  const skillIds = await seedSkills(db, input.workspaceId);
  await seedAgents(db, input, skillIds);
  await seedDemoPrs(db, input);
}

async function seedSkills(db: Db, workspaceId: string): Promise<Map<string, string>> {
  const repo = new SkillsRepository(db);
  const ids = new Map<string, string>();
  for (const fixture of SKILL_FIXTURES) {
    const bytes = new Uint8Array(readFileSync(new URL(fixture.file, import.meta.url)));
    const parsed = parseSkillUpload(fixture.file, bytes);
    const existing = await repo.getByName(workspaceId, parsed.name);
    const row =
      existing ??
      (await repo.insert({
        workspaceId,
        name: parsed.name,
        description: parsed.description,
        type: parsed.type,
        source: fixture.source,
        body: parsed.body,
        message: fixture.source === 'imported' ? importedMessage(fixture.file) : INITIAL_VERSION_MESSAGE,
      }));
    ids.set(parsed.name, row.id);
  }
  return ids;
}

async function seedAgents(
  db: Db,
  input: SkillsLabSeedInput,
  skillIds: Map<string, string>,
): Promise<void> {
  const agents = new AgentsRepository(db);
  for (const spec of SKILLED_AGENTS) {
    const [existing] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, input.workspaceId), eq(t.agents.name, spec.name)));
    const agent =
      existing ??
      (await agents.insert({
        workspaceId: input.workspaceId,
        name: spec.name,
        description: spec.description,
        provider: input.provider,
        model: input.model,
        systemPrompt: spec.systemPrompt,
        createdBy: input.userId,
      }));
    const skillId = skillIds.get(spec.skill);
    if (!skillId) throw new Error(`Seed skill ${spec.skill} is missing`);
    // Only link when the agent has no links yet, so a user's edits survive a re-seed.
    const links = await agents.linkedSkills(agent.id);
    if (links.length === 0) await agents.replaceSkillLinks(agent.id, [{ skill_id: skillId, enabled: true }]);
  }
}

async function seedDemoPrs(db: Db, input: SkillsLabSeedInput): Promise<void> {
  for (const demo of DEMO_PRS) {
    const [existing] = await db
      .select({ id: t.pullRequests.id })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.repoId, input.repoId), eq(t.pullRequests.number, demo.number)));
    if (existing) continue;
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: input.workspaceId,
        repoId: input.repoId,
        number: demo.number,
        title: demo.title,
        author: demo.author,
        branch: demo.branch,
        base: 'main',
        headSha: demo.headSha,
        additions: demo.files.reduce((n, f) => n + f.additions, 0),
        deletions: demo.files.reduce((n, f) => n + f.deletions, 0),
        filesCount: demo.files.length,
        status: 'needs_review',
        body: demo.body,
      })
      .returning({ id: t.pullRequests.id });
    await db.insert(t.prFiles).values(demo.files.map((f) => ({ prId: pr!.id, ...f })));
    await db.insert(t.prCommits).values({
      prId: pr!.id,
      sha: demo.headSha,
      message: demo.commitMessage,
      author: demo.author,
    });
  }
}
