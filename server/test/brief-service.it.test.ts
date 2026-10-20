/**
 * BriefService (SPEC-03) called directly with a capturing logger.
 * DB-backed: `scripts/it-db.sh run server/test/brief-service.it.test.ts`.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockDocsReader, MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { BriefService } from '../src/modules/brief/service.js';
import { IntentRepository } from '../src/modules/intent/repository.js';
import { BriefRepository } from '../src/modules/brief/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const PATCH = '@@ -10,3 +10,4 @@ function cfg()\n   port: 3000,\n+  secretLine: BODY_LINE_MARK,\n   redisUrl: x,';
const OUTPUT = {
  summary: 'Summary of the change.',
  risks: [
    {
      kind: 'security',
      title: 'Config touched',
      explanation: 'why',
      severity: 'high',
      refs: [{ file: 'src/config.ts', start_line: 11, end_line: 11 }],
    },
  ],
  review_focus: [
    { file: 'src/config.ts', line: 11, reason: 'check' },
    { file: 'src/config.ts', line: 900, reason: 'out of range' },
  ],
};

class FlakyLlm extends MockLLMProvider {
  fail = false;
  override async completeStructured<T>(req: Parameters<MockLLMProvider['completeStructured']>[0]) {
    if (this.fail) {
      this.calls.push({ method: 'completeStructured', req });
      throw new Error('RAW_MODEL_OUTPUT_LEAK {"x":1}');
    }
    return super.completeStructured<T>(req as never);
  }
}

const calls = (llm: MockLLMProvider) => llm.calls.filter((c) => c.method === 'completeStructured');
const promptOf = (llm: MockLLMProvider) =>
  (calls(llm).at(-1)!.req as { messages: { content: string }[] }).messages.map((m) => m.content).join('\n');

d('BriefService', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function setup(opts: { clonePath?: string | null; body?: string } = {}) {
    const db = pg.handle.db;
    const name = `brief-${seq++}`;
    const [repo] = await db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name,
        fullName: `acme/${name}`,
        ...(opts.clonePath === undefined ? {} : opts.clonePath ? { clonePath: opts.clonePath } : {}),
      })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 900 + seq,
        title: 'PR_TITLE_MARK',
        author: 'a',
        branch: 'feat/x',
        base: 'main',
        headSha: 'head1111',
        body: opts.body ?? 'PR_BODY_MARK Fixes #471. See specs/linked.md',
        status: 'needs_review',
      })
      .returning();
    await db.insert(t.prFiles).values({ prId: pr!.id, path: 'src/config.ts', additions: 1, deletions: 0, patch: PATCH });
    return { repo: repo!, pr: pr! };
  }

  async function service(llm: MockLLMProvider, extra: { docs?: Record<string, string>; github?: MockGitHubClient } = {}) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github:
          extra.github ??
          new MockGitHubClient({
            issues: { 471: { number: 471, title: 'Issue title', body: 'ISSUE_TEXT_MARK', state: 'open' } },
            files: { 'specs/linked.md': 'LINKED_DOC_MARK' },
          }),
        docs: new MockDocsReader(extra.docs ?? {}),
        llm: { openrouter: llm, openai: llm },
      },
    });
    const logs: { obj: unknown; msg?: string }[] = [];
    const logger = {
      info: (obj: unknown, msg?: string) => void logs.push({ obj, msg }),
      error: (obj: unknown, msg?: string) => void logs.push({ obj, msg }),
    };
    return { app, svc: new BriefService(app.container), logger, logs };
  }

  const okLlm = () => new FlakyLlm('openai', { structuredBySchema: { BriefModelOutput: OUTPUT } });

  it('AC-10 / AC-21 / AC-14 / AC-31 / AC-32: one request, no retry, facts in the prompt, no text in logs', async () => {
    const { pr } = await setup();
    const llm = okLlm();
    const { app, svc, logger, logs } = await service(llm);
    const spy = vi.spyOn(app.container, 'llm');

    const res = await svc.generate(workspaceId, pr.id, logger, 'corr-1');

    expect(spy).toHaveBeenCalledWith('openrouter', { retries: 0 });
    expect(calls(llm)).toHaveLength(1);
    const req = calls(llm)[0]!.req as { maxRetries: number; maxTokens: number; model: string };
    expect(req.maxRetries).toBe(0);
    expect(req.maxTokens).toBe(2000);
    expect(req.model).toBe('openai/gpt-4.1-mini');
    expect(res.stale).toBe(false);
    expect(res.brief).toMatchObject({ attempts: 1, provider: 'openrouter', prompt_version: 'brief-v1' });
    // AC-26 via the service: the out-of-range focus line is dropped
    expect(res.brief!.review_focus).toEqual([{ file: 'src/config.ts', line: 11, reason: 'check' }]);
    expect(res.brief!.dropped).toEqual({ risks: 0, review_focus: 1 });

    const prompt = promptOf(llm);
    for (const mark of ['PR_TITLE_MARK', 'PR_BODY_MARK', 'ISSUE_TEXT_MARK', 'LINKED_DOC_MARK', 'src/config.ts', '@@ -10,3 +10,4 @@']) {
      expect(prompt).toContain(mark);
    }
    expect(prompt).not.toContain('BODY_LINE_MARK');

    const assembled = logs.filter((l) => l.msg === 'prompt.assembled');
    expect(assembled).toHaveLength(1);
    expect(assembled[0]!.obj).toMatchObject({ promptKind: 'brief', correlationId: 'corr-1' });
    const gen = logs.filter((l) => l.msg === 'brief: generated');
    expect(gen).toHaveLength(1);
    expect(gen[0]!.obj).toMatchObject({ provider: 'openrouter', model: 'openai/gpt-4.1-mini', attempts: 1, tokensIn: 100, tokensOut: 50 });
    const all = JSON.stringify(logs);
    for (const mark of ['PR_TITLE_MARK', 'PR_BODY_MARK', 'ISSUE_TEXT_MARK', 'LINKED_DOC_MARK', 'Summary of the change']) {
      expect(all).not.toContain(mark);
    }
    await app.close();
  });

  it('AC-11: the workspace risk_brief setting picks the model', async () => {
    const { pr } = await setup();
    const llm = okLlm();
    const { app, svc } = await service(llm);
    await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { feature_models: { risk_brief: { provider: 'openrouter', model: 'z-ai/custom' } } },
    });
    await svc.generate(workspaceId, pr.id);
    expect((calls(llm)[0]!.req as { model: string }).model).toBe('z-ai/custom');
    await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { feature_models: { risk_brief: { provider: 'openrouter', model: 'openai/gpt-4.1-mini' } } },
    });
    await app.close();
  });

  it('AC-15 / AC-30: with no stored intent no classification runs and the intent input is missing', async () => {
    const { pr } = await setup();
    const llm = okLlm();
    const { app, svc } = await service(llm);
    const res = await svc.generate(workspaceId, pr.id);
    expect(calls(llm).map((c) => (c.req as { schemaName: string }).schemaName)).toEqual(['BriefModelOutput']);
    const byKind = (k: string) => res.brief!.inputs.filter((i) => i.kind === k);
    expect(byKind('intent')[0]!.status).toBe('missing');
    expect(byKind('issue')[0]).toMatchObject({ ref: '#471', status: 'ok' });
    expect(byKind('spec')[0]).toMatchObject({ ref: 'specs/linked.md', status: 'ok' });
    expect(byKind('files')[0]).toMatchObject({ status: 'ok', shown: 1, total: 1 });
    await app.close();
  });

  it('AC-16: a stale stored intent is used and marked stale', async () => {
    const { pr } = await setup();
    await new IntentRepository(pg.handle.db).upsert(pr.id, {
      summary: 'INTENT_SUMMARY_MARK',
      inScope: ['a'],
      outOfScope: ['b'],
      confidence: 'high',
      sources: [],
      missingContext: [],
      headSha: 'older-sha',
      inputHash: 'x',
      provider: 'openrouter',
      model: 'm',
      promptVersion: 'intent-v1',
      tokensIn: 1,
      tokensOut: 1,
      durationMs: 1,
      costUsd: null,
    });
    const llm = okLlm();
    const { app, svc } = await service(llm);
    const res = await svc.generate(workspaceId, pr.id);
    expect(promptOf(llm)).toContain('INTENT_SUMMARY_MARK');
    expect(res.brief!.inputs.find((i) => i.kind === 'intent')!.status).toBe('stale');
    expect(calls(llm)).toHaveLength(1);
    await app.close();
  });

  it('AC-17: agent and skill spec documents are included once; docs-kind and disabled-agent documents are not', async () => {
    const { pr } = await setup({ clonePath: '/mock/clone' });
    const db = pg.handle.db;
    const [on] = await db
      .insert(t.agents)
      .values({ workspaceId, name: 'brief-on', provider: 'openai', model: 'gpt-4.1', systemPrompt: 'x', enabled: true } as never)
      .returning();
    const [off] = await db
      .insert(t.agents)
      .values({ workspaceId, name: 'brief-off', provider: 'openai', model: 'gpt-4.1', systemPrompt: 'x', enabled: false } as never)
      .returning();
    await db.insert(t.agentContextDocs).values([
      { agentId: on!.id, path: 'specs/a.md', position: 0 },
      { agentId: on!.id, path: 'docs/b.md', position: 1 },
      { agentId: on!.id, path: 'specs/linked.md', position: 2 },
      { agentId: off!.id, path: 'specs/off.md', position: 0 },
    ]);
    const llm = okLlm();
    const { app, svc } = await service(llm, {
      docs: { 'specs/a.md': 'ATTACHED_A_MARK', 'docs/b.md': 'DOCS_KIND_MARK', 'specs/off.md': 'OFF_AGENT_MARK', 'specs/linked.md': 'DISK_COPY_MARK' },
    });
    const res = await svc.generate(workspaceId, pr.id);
    const prompt = promptOf(llm);
    expect(prompt).toContain('ATTACHED_A_MARK');
    expect(prompt).toContain('LINKED_DOC_MARK'); // the PR-linked copy wins
    expect(prompt).not.toContain('DISK_COPY_MARK');
    expect(prompt).not.toContain('DOCS_KIND_MARK');
    expect(prompt).not.toContain('OFF_AGENT_MARK');
    const specs = res.brief!.inputs.filter((i) => i.kind === 'spec').map((i) => i.ref).sort();
    expect(specs).toEqual(['specs/a.md', 'specs/linked.md']);
    await db.delete(t.agents).where(eq(t.agents.id, on!.id));
    await db.delete(t.agents).where(eq(t.agents.id, off!.id));
    await app.close();
  });

  it('AC-18: with no GitHub the issue is unavailable and generation goes on', async () => {
    const { pr } = await setup();
    const llm = okLlm();
    const { app, svc } = await service(llm);
    vi.spyOn(app.container, 'github').mockRejectedValue(new Error('no token'));
    const res = await svc.generate(workspaceId, pr.id);
    expect(res.brief!.inputs.find((i) => i.kind === 'issue')).toMatchObject({ ref: '#471', status: 'unavailable' });
    expect(calls(llm)).toHaveLength(1);
    await app.close();
  });

  it('EC-4: a repo that is not cloned gives an unavailable spec entry for an attached document', async () => {
    const { pr } = await setup({ clonePath: null, body: 'plain body' });
    const db = pg.handle.db;
    const [ag] = await db
      .insert(t.agents)
      .values({ workspaceId, name: 'brief-nc', provider: 'openai', model: 'gpt-4.1', systemPrompt: 'x', enabled: true } as never)
      .returning();
    await db.insert(t.agentContextDocs).values({ agentId: ag!.id, path: 'specs/z.md', position: 0 });
    const llm = okLlm();
    const { app, svc } = await service(llm, { docs: { 'specs/z.md': 'Z' } });
    const res = await svc.generate(workspaceId, pr.id);
    expect(res.brief!.inputs.find((i) => i.ref === 'specs/z.md')).toMatchObject({ kind: 'spec', status: 'unavailable' });
    await db.delete(t.agents).where(eq(t.agents.id, ag!.id));
    await app.close();
  });

  it('AC-30: a blast read that throws is recorded as unavailable', async () => {
    const { pr } = await setup();
    const llm = okLlm();
    const { app, svc } = await service(llm);
    vi.spyOn(app.container.repoIntel, 'getBlastRadius').mockRejectedValue(new Error('boom'));
    const res = await svc.generate(workspaceId, pr.id);
    expect(res.brief!.inputs.find((i) => i.kind === 'blast')!.status).toBe('unavailable');
    await app.close();
  });

  it('AC-36: an LLM failure stores nothing, keeps the old brief, hides the raw output and logs brief: failed', async () => {
    const { pr } = await setup();
    const llm = okLlm();
    const { app, svc, logger, logs } = await service(llm);
    const first = await svc.generate(workspaceId, pr.id);
    llm.fail = true;
    const err = await svc.generate(workspaceId, pr.id, logger).catch((e) => e);
    expect(err.statusCode).toBe(502);
    expect(err.details).toBeUndefined();
    expect(String(err.message)).not.toContain('RAW_MODEL_OUTPUT_LEAK');
    expect(JSON.stringify(logs)).not.toContain('RAW_MODEL_OUTPUT_LEAK');
    expect(logs.some((l) => l.msg === 'brief: failed')).toBe(true);
    const stored = await new BriefRepository(pg.handle.db).get(pr.id);
    expect(stored?.generated_at).toBe(first.brief!.generated_at);
    await app.close();
  });
});
