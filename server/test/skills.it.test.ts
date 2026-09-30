import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { zipSync, strToU8 } from 'fflate';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { SkillsRepository } from '../src/modules/skills/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills] Docker not available — skipping integration tests.');
}

const b64 = (s: string | Uint8Array) =>
  Buffer.from(typeof s === 'string' ? s : Buffer.from(s)).toString('base64');

/**
 * L02 — `/skills` CRUD + versioning + import, `POST /agents/:id/skills { items }`,
 * `skill_count` on agents, and `effectiveSkillsForAgent` (the prompt source).
 */
d('skills (L02)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  let n = 0;
  const createBody = (over: Record<string, unknown> = {}) => ({
    name: `skill-${++n}-${Date.now()}`,
    description: 'desc',
    type: 'rubric',
    body: '# Rubric\n\nCheck things.',
    ...over,
  });

  it('req 8: create via API → row in DB; delete row in DB → GET /skills no longer returns it', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'POST', url: '/skills', payload: createBody() });
    expect(res.statusCode).toBe(201);
    const created = res.json();
    expect(created).toMatchObject({ source: 'manual', version: 1, enabled: true, agent_count: 0 });

    const [row] = await pg.handle.db.select().from(t.skills).where(eq(t.skills.id, created.id));
    expect(row?.name).toBe(created.name);
    const [v1] = await pg.handle.db.select().from(t.skillVersions).where(eq(t.skillVersions.skillId, created.id));
    expect(v1).toMatchObject({ version: 1, message: 'Initial version' });

    const listed = (await app.inject({ method: 'GET', url: '/skills' })).json() as Array<{ id: string }>;
    expect(listed.map((s) => s.id)).toContain(created.id);

    await pg.handle.db.delete(t.skills).where(eq(t.skills.id, created.id));
    const after = (await app.inject({ method: 'GET', url: '/skills' })).json() as Array<{ id: string }>;
    expect(after.map((s) => s.id)).not.toContain(created.id);
    expect((await app.inject({ method: 'GET', url: `/skills/${created.id}` })).statusCode).toBe(404);
    await app.close();
  });

  it('lists name-ascending and 409s on a duplicate name', async () => {
    const app = await makeApp();
    const body = createBody({ name: 'zz-dup-check' });
    expect((await app.inject({ method: 'POST', url: '/skills', payload: body })).statusCode).toBe(201);
    const dup = await app.inject({ method: 'POST', url: '/skills', payload: body });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('conflict');

    const names = ((await app.inject({ method: 'GET', url: '/skills' })).json() as Array<{ name: string }>).map((s) => s.name);
    expect(names).toEqual([...names].sort());
    await app.close();
  });

  it('rejects an invalid name / oversized body with 422', async () => {
    const app = await makeApp();
    expect((await app.inject({ method: 'POST', url: '/skills', payload: createBody({ name: 'Bad Name' }) })).statusCode).toBe(422);
    expect((await app.inject({ method: 'POST', url: '/skills', payload: createBody({ body: 'x'.repeat(20_001) }) })).statusCode).toBe(422);
    await app.close();
  });

  it('versioning: content change bumps; enabled-only does not; restore is non-destructive', async () => {
    const app = await makeApp();
    const s = (await app.inject({ method: 'POST', url: '/skills', payload: createBody({ body: 'v1 body' }) })).json();

    const toggled = await app.inject({ method: 'PUT', url: `/skills/${s.id}`, payload: { enabled: false } });
    expect(toggled.json()).toMatchObject({ version: 1, enabled: false });

    const edited = await app.inject({
      method: 'PUT',
      url: `/skills/${s.id}`,
      payload: { body: 'v2 body', message: 'tighten' },
    });
    expect(edited.json()).toMatchObject({ version: 2, body: 'v2 body' });

    const same = await app.inject({ method: 'PUT', url: `/skills/${s.id}`, payload: { body: 'v2 body' } });
    expect(same.json().version).toBe(2);

    const restored = await app.inject({ method: 'POST', url: `/skills/${s.id}/versions/1/restore` });
    expect(restored.statusCode).toBe(200);
    expect(restored.json()).toMatchObject({ version: 3, body: 'v1 body' });

    const versions = (await app.inject({ method: 'GET', url: `/skills/${s.id}/versions` })).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([3, 2, 1]);
    expect(versions[0].message).toBe('Restored from v1');
    expect(versions[1]).toMatchObject({ body: 'v2 body', message: 'tighten' });

    expect((await app.inject({ method: 'POST', url: `/skills/${s.id}/versions/99/restore` })).statusCode).toBe(404);
    await app.close();
  });

  it('PUT renaming onto an existing name → 409; unknown id → 404', async () => {
    const app = await makeApp();
    const a = (await app.inject({ method: 'POST', url: '/skills', payload: createBody() })).json();
    const b = (await app.inject({ method: 'POST', url: '/skills', payload: createBody() })).json();
    expect((await app.inject({ method: 'PUT', url: `/skills/${b.id}`, payload: { name: a.name } })).statusCode).toBe(409);
    expect((await app.inject({ method: 'PUT', url: '/skills/00000000-0000-0000-0000-000000000000', payload: { enabled: true } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: '/skills/00000000-0000-0000-0000-000000000000' })).statusCode).toBe(404);
    await app.close();
  });

  it('import: preview saves nothing; commit saves source=imported with edits; bad file → 400', async () => {
    const app = await makeApp();
    const before = (await pg.handle.db.select().from(t.skills)).length;
    const zip = zipSync({
      'guard/SKILL.md': strToU8('---\nname: zip-import-guard\ntype: security\n---\n# Guard\n\nBe careful.'),
      'guard/run.sh': strToU8('echo hi'),
    });
    const upload = { filename: 'guard.zip', content_base64: b64(zip) };

    const preview = await app.inject({ method: 'POST', url: '/skills/import/preview', payload: upload });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({
      name: 'zip-import-guard',
      type: 'security',
      source_file: 'guard/SKILL.md',
      ignored_files: ['guard/run.sh'],
    });
    expect((await pg.handle.db.select().from(t.skills)).length).toBe(before);

    const commit = await app.inject({
      method: 'POST',
      url: '/skills/import',
      payload: { ...upload, description: 'edited in preview' },
    });
    expect(commit.statusCode).toBe(201);
    expect(commit.json()).toMatchObject({
      name: 'zip-import-guard',
      source: 'imported',
      description: 'edited in preview',
      version: 1,
    });
    expect(commit.json().body).not.toContain('echo hi');
    expect((await app.inject({ method: 'POST', url: '/skills/import', payload: upload })).statusCode).toBe(409);

    const bad = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'x.txt', content_base64: b64('hello') },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.message).toMatch(/\.md or \.zip/);
    await app.close();
  });

  it('agents: items replace links in order with enabled flags; skill_count; effective skills', async () => {
    const app = await makeApp();
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: `Skilled ${Date.now()}`, provider: 'openai', model: 'gpt-4o-mini', system_prompt: 'Review.' },
      })
    ).json();
    const s1 = (await app.inject({ method: 'POST', url: '/skills', payload: createBody({ body: 'one' }) })).json();
    const s2 = (await app.inject({ method: 'POST', url: '/skills', payload: createBody({ body: 'two' }) })).json();
    const s3 = (await app.inject({ method: 'POST', url: '/skills', payload: createBody({ body: 'three' }) })).json();

    const set = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: {
        items: [
          { skill_id: s3.id, enabled: true },
          { skill_id: s1.id, enabled: false },
          { skill_id: s2.id, enabled: true },
        ],
      },
    });
    expect(set.statusCode).toBe(200);
    expect(set.json()).toEqual([
      { agent_id: agent.id, skill_id: s3.id, order: 0, enabled: true },
      { agent_id: agent.id, skill_id: s1.id, order: 1, enabled: false },
      { agent_id: agent.id, skill_id: s2.id, order: 2, enabled: true },
    ]);
    expect((await app.inject({ method: 'GET', url: `/agents/${agent.id}/skills` })).json()).toEqual(set.json());

    expect((await app.inject({ method: 'GET', url: `/agents/${agent.id}` })).json().skill_count).toBe(2);
    const listed = (await app.inject({ method: 'GET', url: '/agents' })).json() as Array<{ id: string; skill_count: number }>;
    expect(listed.find((a) => a.id === agent.id)?.skill_count).toBe(2);
    expect((await app.inject({ method: 'GET', url: `/skills/${s1.id}` })).json().agent_count).toBe(1);

    const repo = new SkillsRepository(pg.handle.db);
    expect((await repo.effectiveSkillsForAgent(agent.id)).map((s) => s.body)).toEqual(['three', 'two']);
    // global kill-switch removes it from the prompt
    await app.inject({ method: 'PUT', url: `/skills/${s3.id}`, payload: { enabled: false } });
    const eff = await repo.effectiveSkillsForAgent(agent.id);
    expect(eff).toEqual([{ id: s2.id, name: s2.name, version: 1, type: 'rubric', body: 'two' }]);

    // unknown skill / duplicates → 422-free 400, links unchanged
    const bad = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { items: [{ skill_id: '00000000-0000-0000-0000-000000000000', enabled: true }] },
    });
    expect(bad.statusCode).toBe(400);
    const dup = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { items: [{ skill_id: s2.id, enabled: true }, { skill_id: s2.id, enabled: false }] },
    });
    expect(dup.statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: `/agents/${agent.id}/skills` })).json()).toHaveLength(3);

    // legacy skill_ids form still works (enabled=true)
    const legacy = await app.inject({ method: 'POST', url: `/agents/${agent.id}/skills`, payload: { skill_ids: [s1.id] } });
    expect(legacy.json()).toEqual([{ agent_id: agent.id, skill_id: s1.id, order: 0, enabled: true }]);

    // deleting a skill cascades its links
    await app.inject({ method: 'DELETE', url: `/skills/${s1.id}` });
    const links = await pg.handle.db
      .select()
      .from(t.agentSkills)
      .where(and(eq(t.agentSkills.agentId, agent.id), eq(t.agentSkills.skillId, s1.id)));
    expect(links).toHaveLength(0);
    await app.close();
  });

  it('seed: skills, agents and demo PRs exist, api-contract-guard is imported, and re-seeding is idempotent', async () => {
    await seed(pg.handle.db);
    const skills = await pg.handle.db.select().from(t.skills).where(eq(t.skills.workspaceId, workspaceId));
    const byName = new Map(skills.map((s) => [s.name, s]));
    for (const name of ['pr-quality-rubric', 'secret-leakage-gate', 'test-quality-rubric', 'api-contract-guard']) {
      expect(skills.filter((s) => s.name === name)).toHaveLength(1);
    }
    expect(byName.get('api-contract-guard')?.source).toBe('imported');
    expect(byName.get('test-quality-rubric')?.type).toBe('rubric');

    const agents = await pg.handle.db.select().from(t.agents).where(eq(t.agents.workspaceId, workspaceId));
    const repo = new SkillsRepository(pg.handle.db);
    for (const [agentName, skillName] of [
      ['Test Quality Reviewer', 'test-quality-rubric'],
      ['API Contract Reviewer', 'api-contract-guard'],
    ] as const) {
      const matching = agents.filter((a) => a.name === agentName);
      expect(matching).toHaveLength(1);
      expect(matching[0]!.systemPrompt).not.toMatch(/boundary|breaking/i);
      expect((await repo.effectiveSkillsForAgent(matching[0]!.id)).map((s) => s.name)).toEqual([skillName]);
    }

    const [repoRow] = await pg.handle.db.select().from(t.repos).where(eq(t.repos.fullName, 'acme/payments-api'));
    for (const num of [483, 484]) {
      const prs = await pg.handle.db
        .select()
        .from(t.pullRequests)
        .where(and(eq(t.pullRequests.repoId, repoRow!.id), eq(t.pullRequests.number, num)));
      expect(prs).toHaveLength(1);
      const files = await pg.handle.db.select().from(t.prFiles).where(eq(t.prFiles.prId, prs[0]!.id));
      expect(files.length).toBeGreaterThan(0);
      for (const f of files) expect(f.patch).toMatch(/^@@ /);
    }
  });
});
