import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type {
  ChatMessage,
  CompletionResult,
  ExtractedConvention,
  LLMProvider,
  ModelInfo,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[conventions] Docker not available — skipping integration tests.');
}

/** An LLM whose next structured answer (or failure / hold) the test scripts. */
class ScriptedLLM implements LLMProvider {
  readonly id = 'openrouter' as const;
  conventions: ExtractedConvention[] = [];
  fail: Error | null = null;
  hold: Promise<void> | null = null;
  calls: { messages: ChatMessage[]; timeoutMs?: number; maxRetries?: number }[] = [];

  async listModels(): Promise<ModelInfo[]> {
    return [];
  }
  async complete(): Promise<CompletionResult> {
    throw new Error('not used');
  }
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls.push({ messages: req.messages, timeoutMs: req.timeoutMs, maxRetries: req.maxRetries });
    if (this.hold) await this.hold;
    if (this.fail) throw this.fail;
    const data = req.schema.parse({ conventions: this.conventions });
    return { data, model: req.model, tokensIn: 10, tokensOut: 10, costUsd: 0.001, raw: '', attempts: 1 };
  }
  async embed(): Promise<number[][]> {
    return [];
  }
}

const code = (n: number) => Array.from({ length: n }, (_, i) => `export const v${i + 1} = ${i + 1};`).join('\n');

const FILES: Record<string, string> = {
  'tsconfig.json': '{\n  "compilerOptions": { "strict": true }\n}\n',
  'server/package.json': '{ "name": "server" }\n',
  'server/tsconfig.json': '{ "extends": "../tsconfig.json" }\n',
  'client/tsconfig.json': '{ "jsx": "preserve" }\n', // no client/package.json → not searched
  'server/src/app.ts': code(40),
  'server/src/run-executor.ts': code(20),
};

const conv = (rule: string, file = 'server/src/app.ts', s = 2, e = 4, confidence = 0.8): ExtractedConvention => ({
  category: 'naming',
  rule,
  evidence: { file, start_line: s, end_line: e },
  confidence,
});

interface Candidate {
  id: string;
  rule: string;
  status: string;
  edited: boolean;
  accepted: boolean;
  category: string;
  evidence_snippet: string;
  confidence: number;
}

/**
 * L03 — conventions → skill over a real Postgres: scan lifecycle and
 * persistence (req 38), sampling (39), grounding (40), reject persistence (48),
 * re-scan merge, draft (41) and create + link (42, 52).
 */
d('conventions (L03)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;
  let unindexedRepoId: string;
  let agentId: string;
  const llm = new ScriptedLLM();

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    const db = pg.handle.db;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'conv-demo', fullName: 'acme/conv-demo' })
      .returning();
    repoId = repo!.id;
    await db.insert(t.fileRank).values(
      ['server/src/app.ts', 'server/src/run-executor.ts'].map((filePath, i) => ({
        repoId,
        filePath,
        pagerank: 1 - i * 0.1,
        hotness: 0,
        rank: 1 - i * 0.1,
        percentile: 99 - i,
      })),
    );
    const [unindexed] = await db.select().from(t.repos).where(eq(t.repos.fullName, 'acme/payments-api'));
    unindexedRepoId = unindexed!.id;
    const [agent] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'General Reviewer')));
    agentId = agent!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ files: FILES }),
        github: new MockGitHubClient(),
        llm: { openrouter: llm, openai: llm, anthropic: llm },
      },
    });
  }

  type App = Awaited<ReturnType<typeof makeApp>>;

  async function getState(app: App, id = repoId) {
    const res = await app.inject({ method: 'GET', url: `/repos/${id}/conventions` });
    expect(res.statusCode).toBe(200);
    return res.json() as {
      indexed: boolean;
      repo_name: string;
      scan: { id: string; status: string; error: string | null; sample_files: string[]; candidates_found: number | null } | null;
      candidates: Candidate[];
    };
  }

  async function waitForScan(app: App) {
    for (let i = 0; i < 100; i++) {
      const s = await getState(app);
      if (s.scan && s.scan.status !== 'running') return s;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('scan did not finish');
  }

  async function scan(app: App, conventions: ExtractedConvention[]) {
    llm.conventions = conventions;
    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ status: 'running', repo_id: repoId });
    return waitForScan(app);
  }

  const patch = (app: App, id: string, payload: Record<string, unknown>) =>
    app.inject({ method: 'PATCH', url: `/conventions/${id}`, payload });

  it('422 for a repo with no ranked files; GET reports indexed=false', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'POST', url: `/repos/${unindexedRepoId}/conventions/extract` });
    expect(res.statusCode).toBe(422);
    const state = await getState(app, unindexedRepoId);
    expect(state).toMatchObject({ indexed: false, scan: null, candidates: [] });
    await app.close();
  });

  it('req 38/39/40: extract samples configs + top files, grounds candidates, persists across app instances', async () => {
    const app = await makeApp();
    const before = await getState(app);
    expect(before).toMatchObject({ indexed: true, repo_name: 'acme/conv-demo', scan: null });

    const done = await scan(app, [
      conv('Name exported constants v<N>', 'server/src/app.ts', 2, 4, 0.9),
      conv('Rejected later rule', 'server/src/run-executor.ts', 1, 2, 0.7),
      conv('Edited later rule', 'server/src/app.ts', 10, 11, 0.6),
      conv('Pending rule', './server/src/app.ts', 5, 3, 0.5),
      conv('Cites an unsampled file', 'server/src/nope.ts', 1, 1),
      conv('Cites lines out of range', 'server/src/run-executor.ts', 19, 25),
    ]);
    expect(done.scan).toMatchObject({ status: 'done', candidates_found: 4, error: null });
    // req 39: configs first (root + package.json-adjacent dirs), then ranked samples
    expect(done.scan!.sample_files).toEqual([
      'tsconfig.json',
      'server/tsconfig.json',
      'server/src/app.ts',
      'server/src/run-executor.ts',
    ]);
    const call = llm.calls.at(-1)!;
    expect(call.timeoutMs).toBeGreaterThan(0);
    expect(call.maxRetries).toBe(1);
    expect(call.messages[1]!.content).toContain('<untrusted source="file:server/src/app.ts">');

    expect(done.candidates.map((c) => c.rule)).toEqual([
      'Name exported constants v<N>',
      'Rejected later rule',
      'Edited later rule',
      'Pending rule',
    ]);
    const pending = done.candidates.find((c) => c.rule === 'Pending rule')!;
    expect(pending.evidence_snippet).toBe('export const v3 = 3;\nexport const v4 = 4;\nexport const v5 = 5;');
    expect(pending).toMatchObject({ status: 'pending', accepted: false, edited: false });
    await app.close();

    // a fresh app instance (≈ server restart) still sees them
    const app2 = await makeApp();
    const after = await getState(app2);
    expect(after.candidates).toHaveLength(4);
    expect(after.scan!.id).toBe(done.scan!.id);
    await app2.close();
  });

  it('req 47/48/49: accept, reject (gone for good, unusable in skills), edit inline; 404 across workspaces', async () => {
    const app = await makeApp();
    const { candidates } = await getState(app);
    const byRule = (r: string) => candidates.find((c) => c.rule === r)!;

    const acc = await patch(app, byRule('Name exported constants v<N>').id, { status: 'accepted' });
    expect(acc.statusCode).toBe(200);
    expect(acc.json()).toMatchObject({ status: 'accepted', accepted: true, edited: false });

    const rejectedId = byRule('Rejected later rule').id;
    expect((await patch(app, rejectedId, { status: 'rejected' })).json()).toMatchObject({ status: 'rejected' });

    const edited = await patch(app, byRule('Edited later rule').id, { category: 'structure', evidence_snippet: 'x' });
    expect(edited.json()).toMatchObject({ category: 'structure', edited: true, evidence_snippet: 'x', status: 'pending' });
    expect((await patch(app, byRule('Edited later rule').id, { evidence_start_line: 9, evidence_end_line: 2 })).statusCode).toBe(400);

    const state = await getState(app);
    expect(state.candidates.map((c) => c.id)).not.toContain(rejectedId);
    expect(state.candidates[0]!.status).toBe('accepted'); // accepted first

    const draft = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill-draft`,
      payload: { candidate_ids: [rejectedId] },
    });
    expect(draft.statusCode).toBe(400);
    const pendingDraft = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill-draft`,
      payload: { candidate_ids: [byRule('Pending rule').id] },
    });
    expect(pendingDraft.statusCode).toBe(400);

    // another workspace's candidate is invisible
    const db = pg.handle.db;
    const [ws2] = await db.insert(t.workspaces).values({ name: `other-${Date.now()}` }).returning();
    const [foreign] = await db
      .insert(t.conventions)
      .values({ workspaceId: ws2!.id, rule: 'Foreign rule', evidencePath: 'a.ts', evidenceSnippet: 'x', confidence: 0.5 })
      .returning();
    expect((await patch(app, foreign!.id, { status: 'accepted' })).statusCode).toBe(404);
    await app.close();
  });

  it('re-scan keeps accepted/rejected/edited, replaces other pending, never resurrects a rejected rule', async () => {
    const app = await makeApp();
    const before = await getState(app);
    const oldPendingId = before.candidates.find((c) => c.rule === 'Pending rule')!.id;

    const after = await scan(app, [
      conv('name exported constants v<N>.', 'server/src/app.ts', 2, 3),
      conv('Rejected later rule', 'server/src/app.ts', 1, 1),
      conv('Edited later rule', 'server/src/app.ts', 1, 1),
      conv('Pending rule', 'server/src/app.ts', 1, 1, 0.3),
      conv('Brand new rule', 'server/src/run-executor.ts', 1, 1, 0.95),
    ]);
    expect(after.scan).toMatchObject({ status: 'done', candidates_found: 2 });
    const rules = after.candidates.map((c) => c.rule).sort();
    expect(rules).toEqual(['Brand new rule', 'Edited later rule', 'Name exported constants v<N>', 'Pending rule']);
    expect(after.candidates.map((c) => c.id)).not.toContain(oldPendingId);
    expect(after.candidates.find((c) => c.rule === 'Edited later rule')).toMatchObject({ edited: true, category: 'structure' });

    const rejectedRows = await pg.handle.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.repoId, repoId), eq(t.conventions.rule, 'Rejected later rule')));
    expect(rejectedRows).toHaveLength(1);
    expect(rejectedRows[0]!.status).toBe('rejected');
    await app.close();
  });

  it('409 while a scan is running; a failed model call is stored on the scan', async () => {
    const app = await makeApp();
    let release!: () => void;
    llm.hold = new Promise<void>((r) => (release = r));
    llm.fail = new Error('provider exploded');
    const first = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(first.statusCode).toBe(202);
    const second = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(second.statusCode).toBe(409);
    release();
    const state = await waitForScan(app);
    expect(state.scan).toMatchObject({ status: 'failed', error: 'provider exploded' });
    expect(state.candidates.length).toBeGreaterThan(0); // nothing lost on failure
    llm.hold = null;
    llm.fail = null;
    await app.close();
  });

  it('a running scan older than 10 minutes is treated as stale', async () => {
    const [stale] = await pg.handle.db
      .insert(t.conventionScans)
      .values({
        workspaceId,
        repoId,
        status: 'running',
        provider: 'openrouter',
        model: 'm',
        startedAt: new Date(Date.now() - 11 * 60_000),
      })
      .returning();
    const app = await makeApp();
    const state = await getState(app);
    expect(state.scan!.id).not.toBe(stale!.id); // newer finished scans exist
    const [row] = await pg.handle.db.select().from(t.conventionScans).where(eq(t.conventionScans.id, stale!.id));
    expect(row).toMatchObject({ status: 'failed' });
    expect(row!.error).toMatch(/did not finish/);
    await app.close();
  });

  it('req 41/42/52: draft from accepted → create skill (extracted, v1) linked to the agent; 409 on a name clash', async () => {
    const app = await makeApp();
    const { candidates } = await getState(app);
    const accepted = candidates.filter((c) => c.status === 'accepted');
    const brandNew = candidates.find((c) => c.rule === 'Brand new rule')!;
    await patch(app, brandNew.id, { status: 'accepted' });
    const ids = [...accepted.map((c) => c.id), brandNew.id];

    const draftRes = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill-draft`,
      payload: { candidate_ids: ids },
    });
    expect(draftRes.statusCode).toBe(200);
    const draft = draftRes.json();
    expect(draft).toMatchObject({
      name: 'repo-conventions',
      type: 'convention',
      description: '2 house conventions extracted from acme/conv-demo',
    });
    expect(draft.body).toContain('## name-exported-constants-v-n');
    expect(draft.body).toContain('Detected in `server/src/run-executor.ts:1-1`:');

    const linksBefore = await pg.handle.db.select().from(t.agentSkills).where(eq(t.agentSkills.agentId, agentId));
    const payload = { candidate_ids: ids, name: draft.name, description: draft.description, body: draft.body, agent_id: agentId };
    const created = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/skill`, payload });
    expect(created.statusCode).toBe(201);
    const result = created.json();
    expect(result.linked_agent_id).toBe(agentId);
    expect(result.skill).toMatchObject({
      name: 'repo-conventions',
      source: 'extracted',
      type: 'convention',
      enabled: true,
      version: 1,
      agent_count: 1,
    });
    expect([...result.skill.evidence_files].sort()).toEqual(['server/src/app.ts', 'server/src/run-executor.ts']);

    const skills = (await app.inject({ method: 'GET', url: '/skills' })).json() as Array<{ id: string }>;
    expect(skills.map((s) => s.id)).toContain(result.skill.id);
    const [v1] = await pg.handle.db.select().from(t.skillVersions).where(eq(t.skillVersions.skillId, result.skill.id));
    expect(v1!.message).toBe('Created from 2 conventions');

    const links = await pg.handle.db.select().from(t.agentSkills).where(eq(t.agentSkills.agentId, agentId));
    expect(links).toHaveLength(linksBefore.length + 1);
    const mine = links.find((l) => l.skillId === result.skill.id)!;
    expect(mine.enabled).toBe(true);
    expect(mine.order).toBe(Math.max(...links.map((l) => l.order)));

    const clash = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/skill`, payload });
    expect(clash.statusCode).toBe(409);
    expect(await pg.handle.db.select().from(t.agentSkills).where(eq(t.agentSkills.agentId, agentId))).toHaveLength(
      links.length,
    );

    const unknownAgent = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill`,
      payload: { ...payload, name: 'repo-conventions-2', agent_id: '00000000-0000-4000-8000-000000000000' },
    });
    expect(unknownAgent.statusCode).toBe(400);
    const unlinked = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill`,
      payload: { ...payload, name: 'repo-conventions-3', agent_id: null },
    });
    expect(unlinked.statusCode).toBe(201);
    expect(unlinked.json()).toMatchObject({ linked_agent_id: null, skill: { agent_count: 0 } });
    await app.close();
  });

  it('req 43: the API Contract Reviewer has api-contract-guard first, then the four contract skills', async () => {
    const db = pg.handle.db;
    const [agent] = await db.select().from(t.agents).where(eq(t.agents.name, 'API Contract Reviewer'));
    const links = await db
      .select({ name: t.skills.name, order: t.agentSkills.order, enabled: t.agentSkills.enabled, body: t.skills.body, description: t.skills.description })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(eq(t.agentSkills.agentId, agent!.id))
      .orderBy(t.agentSkills.order);
    expect(links.map((l) => l.name)).toEqual([
      'api-contract-guard',
      'breaking-change',
      'response-schema',
      'semver-discipline',
      'deprecation-policy',
    ]);
    for (const l of links.slice(1)) {
      expect(l.enabled).toBe(true);
      expect(l.body).toMatch(/^## Good$/m);
      expect(l.body).toMatch(/^## Bad$/m);
      expect(l.description.length).toBeGreaterThan(20);
    }
    // idempotent: a second seed adds nothing
    await seed(db);
    const again = await db.select().from(t.agentSkills).where(eq(t.agentSkills.agentId, agent!.id));
    expect(again).toHaveLength(5);
    const named = await db.select().from(t.skills).where(eq(t.skills.name, 'breaking-change'));
    expect(named).toHaveLength(1);
  });
});
