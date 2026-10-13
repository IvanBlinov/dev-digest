import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { Review } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { intentMockLlm } from './helpers/intent-mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const EMPTY_REVIEW: Review = { verdict: 'approve', summary: 'ok', score: 100, findings: [] };

type Db = PgFixture['handle']['db'];
let seq = 0;

async function setupPr(db: Db, workspaceId: string) {
  const name = `skills-api-${seq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 500 + seq,
      title: 'Skills order',
      author: 'marisa.koch',
      branch: 'feat/skills',
      base: 'main',
      headSha: 'b1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return pr!;
}

async function insertSkill(
  db: Db,
  workspaceId: string,
  name: string,
  opts: { enabled?: boolean; type?: 'rubric' | 'convention' | 'security' | 'custom' } = {},
) {
  const [row] = await db
    .insert(t.skills)
    .values({
      workspaceId,
      name,
      description: `${name} description`,
      type: opts.type ?? 'custom',
      source: 'manual',
      body: `BODY-OF-${name}`,
      enabled: opts.enabled ?? true,
    })
    .returning();
  return row!;
}

d('L02 skills reach the prompt and the trace (pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function runOnce(agentId: string, llm: MockLLMProvider) {
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        github: new MockGitHubClient(),
        llm: { openai: llm, openrouter: intentMockLlm() },
      },
    });
    const pr = await setupPr(pg.handle.db, workspaceId);
    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId } });
    expect(res.statusCode).toBe(200);
    const runId = res.json().runs[0].run_id as string;
    const runs = await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    expect(runs[0]!.status).toBe('done');
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    await app.close();
    const call = llm.calls.find((c) => c.method === 'completeStructured')!;
    const messages = (call.req as { messages: { role: string; content: string }[] }).messages;
    const user = messages.find((m) => m.role === 'user')!.content;
    return { trace, user };
  }

  it('injects enabled skills in link order, swaps with the order, and never injects disabled ones', async () => {
    const db = pg.handle.db;
    const setupApp = await buildApp({ config: config(), db, overrides: { embedder: new MockEmbedder() } });
    const agent = (
      await setupApp.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Skills Agent', provider: 'openai', model: 'gpt-4.1', system_prompt: 'review' },
      })
    ).json();
    await setupApp.close();

    const a = await insertSkill(db, workspaceId, 'l02-skill-a', { type: 'security' });
    const b = await insertSkill(db, workspaceId, 'l02-skill-b', { type: 'convention' });
    const offLink = await insertSkill(db, workspaceId, 'l02-skill-off-link');
    const offGlobal = await insertSkill(db, workspaceId, 'l02-skill-off-global', { enabled: false });
    await db.insert(t.agentSkills).values([
      { agentId: agent.id, skillId: a.id, order: 0, enabled: true },
      { agentId: agent.id, skillId: offLink.id, order: 1, enabled: false },
      { agentId: agent.id, skillId: b.id, order: 2, enabled: true },
      { agentId: agent.id, skillId: offGlobal.id, order: 3, enabled: true },
    ]);

    // ---- Order A, B --------------------------------------------------------
    const first = await runOnce(agent.id, new MockLLMProvider('openai', { structured: EMPTY_REVIEW }));
    expect(first.user).toContain('### Skill: l02-skill-a (v1, security)\nBODY-OF-l02-skill-a');
    expect(first.user.indexOf('Skill: l02-skill-a')).toBeLessThan(first.user.indexOf('Skill: l02-skill-b'));
    expect(first.user).not.toContain('l02-skill-off-link');
    expect(first.user).not.toContain('l02-skill-off-global');

    const pa = first.trace.prompt_assembly;
    expect(pa.skills_blocks.map((x: { name: string }) => x.name)).toEqual(['l02-skill-a', 'l02-skill-b']);
    expect(pa.skills_blocks[0]).toMatchObject({ skill_id: a.id, version: 1, type: 'security' });
    for (const blk of pa.skills_blocks) expect(blk.tokens).toBeGreaterThan(0);
    expect(pa.skills_tokens).toBeGreaterThanOrEqual(
      pa.skills_blocks.reduce((n: number, x: { tokens: number }) => n + x.tokens, 0) - 2,
    );
    expect(first.trace.log.some((e: { msg: string }) => e.msg.startsWith('skills: 2 injected ('))).toBe(true);

    // ---- Swap to B, A -----------------------------------------------------
    await db.update(t.agentSkills).set({ order: 5 }).where(and(eq(t.agentSkills.agentId, agent.id), eq(t.agentSkills.skillId, a.id)));
    const second = await runOnce(agent.id, new MockLLMProvider('openai', { structured: EMPTY_REVIEW }));
    expect(second.user.indexOf('Skill: l02-skill-b')).toBeLessThan(second.user.indexOf('Skill: l02-skill-a'));
    expect(second.trace.prompt_assembly.skills_blocks.map((x: { name: string }) => x.name)).toEqual([
      'l02-skill-b',
      'l02-skill-a',
    ]);
  });

  it('an agent with no enabled skills gets no skills section and null trace fields', async () => {
    const db = pg.handle.db;
    const setupApp = await buildApp({ config: config(), db, overrides: { embedder: new MockEmbedder() } });
    const agent = (
      await setupApp.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'No Skills Agent', provider: 'openai', model: 'gpt-4.1', system_prompt: 'review' },
      })
    ).json();
    await setupApp.close();

    const { trace, user } = await runOnce(agent.id, new MockLLMProvider('openai', { structured: EMPTY_REVIEW }));
    expect(user).not.toContain('## Skills / rules');
    expect(trace.prompt_assembly.skills ?? null).toBeNull();
    expect(trace.prompt_assembly.skills_blocks ?? null).toBeNull();
    expect(trace.prompt_assembly.skills_tokens ?? null).toBeNull();
  });
});
