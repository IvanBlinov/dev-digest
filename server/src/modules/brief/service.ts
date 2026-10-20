import { randomUUID } from 'node:crypto';
import type { BlastRadius, IntentSource, PrBrief, PrBriefResponse } from '@devdigest/shared';
import { BriefModelOutput } from '@devdigest/shared';
import {
  BRIEF_BUDGET,
  BRIEF_MAX_OUTPUT_TOKENS,
  BRIEF_PROMPT_VERSION,
  buildBriefMessages,
  type BriefPromptBlast,
  type BriefPromptInput,
} from '@devdigest/reviewer-core';
import type { Container } from '../../platform/container.js';
import {
  PROMPT_ASSEMBLED_MSG,
  buildPromptAssembledEvent,
  makeMeter,
} from '../../platform/prompt-log.js';
import { AppError, ConfigError, ExternalServiceError, NotFoundError } from '../../platform/errors.js';
import type { PullRow } from '../../db/rows.js';
import * as schema from '../../db/schema.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { ReviewRepository } from '../reviews/repository.js';
import {
  buildProjectContextPlan,
  orderContextPaths,
  readProjectDocs,
  type ContextEntry,
  type ContextRead,
} from '../reviews/project-context-prompt.js';
import { partitionBlockedSkills } from '../reviews/skills-prompt.js';
import { docKind, makeRootMatcher } from '../project-context/helpers.js';
import { classifyFile } from '../smart-diff/helpers.js';
import { IntentService, type PinoLike } from '../intent/service.js';
import { BlastService } from '../blast/service.js';
import { extractReferences } from '../intent/helpers.js';
import { resolveSources } from '../intent/source-resolver.js';
import { BRIEF_TIMEOUT_MS } from './constants.js';
import {
  briefInputHash,
  briefStaleness,
  buildBriefProvenance,
  hunkHeaders,
  validateBriefOutput,
} from './helpers.js';
import { BriefRepository } from './repository.js';

type RepoRow = typeof schema.repos.$inferSelect;
type Status = 'ok' | 'unavailable' | 'over_budget' | 'truncated';

const EMPTY: PrBriefResponse = { brief: null, stale: false, stale_reason: null };

/** Error label that is safe to log or return: a code or class name, never a message that may echo model text. */
function errorLabel(err: unknown): string {
  if (err instanceof AppError) return err.code;
  return err instanceof Error ? err.name : 'Error';
}

function toPromptBlast(b: BlastRadius): BriefPromptBlast {
  return {
    summary: b.summary,
    degraded: b.degraded === true,
    ...(b.reason ? { reason: b.reason } : {}),
    changedSymbols: b.changed_symbols,
    callers: b.downstream.flatMap((d) => d.callers.map((c) => ({ symbol: d.symbol, ...c }))),
  };
}

/**
 * PR Brief: one LLM request over facts computed beforehand (intent, blast radius, file list with
 * hunk headers, linked issues, spec documents). Cached per PR in `pr_brief`.
 */
export class BriefService {
  private repo: BriefRepository;
  private reviews: ReviewRepository;
  private intent: IntentService;
  private blast: BlastService;
  /** In-process lock (single API instance): one generation per PR at a time. */
  private inFlight = new Set<string>();

  constructor(private container: Container) {
    this.repo = new BriefRepository(container.db);
    this.reviews = new ReviewRepository(container.db);
    this.intent = new IntentService(container);
    this.blast = new BlastService(container);
  }

  private async requirePull(workspaceId: string, prId: string): Promise<{ pull: PullRow; repo: RepoRow }> {
    const pull = await this.reviews.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await this.reviews.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return { pull, repo };
  }

  /** The stored brief with a freshly derived staleness; never calls a model. */
  async get(workspaceId: string, prId: string): Promise<PrBriefResponse> {
    const { pull } = await this.requirePull(workspaceId, prId);
    const stored = await this.repo.get(pull.id);
    if (!stored) return EMPTY;
    const reason = briefStaleness(stored, {
      headSha: pull.headSha,
      title: pull.title,
      body: pull.body ?? '',
      promptVersion: BRIEF_PROMPT_VERSION,
    });
    return { brief: stored, stale: reason !== null, stale_reason: reason };
  }

  /** POST: generate now (always), store, return the fresh brief. */
  async generate(
    workspaceId: string,
    prId: string,
    logger?: PinoLike,
    correlationId: string = randomUUID(),
  ): Promise<PrBriefResponse> {
    const { pull, repo } = await this.requirePull(workspaceId, prId);
    const files = await this.reviews.getPrFiles(pull.id);
    if (files.length === 0) {
      throw new AppError('brief_no_files', 'This PR has no changed files to brief', 422);
    }
    if (this.inFlight.has(pull.id)) {
      throw new AppError('brief_in_progress', 'A brief is already being generated for this PR', 409);
    }
    this.inFlight.add(pull.id);
    try {
      const brief = await this.run(workspaceId, pull, repo, files, logger, correlationId);
      return { brief, stale: false, stale_reason: null };
    } catch (err) {
      logger?.error({ prId, correlationId, err: errorLabel(err) }, 'brief: failed');
      throw err;
    } finally {
      this.inFlight.delete(pull.id);
    }
  }

  private async run(
    workspaceId: string,
    pull: PullRow,
    repo: RepoRow,
    files: (typeof schema.prFiles.$inferSelect)[],
    logger: PinoLike | undefined,
    correlationId: string,
  ): Promise<PrBrief> {
    const started = Date.now();
    const body = pull.body ?? '';
    const tokenizer = this.container.tokenizer;

    // ---- gather ----
    const intentRec = (await this.intent.get(workspaceId, pull.id)).intent;
    let blast: BlastRadius | 'unavailable';
    try {
      blast = await this.blast.get(workspaceId, pull.id);
    } catch {
      blast = 'unavailable';
    }

    const refs = extractReferences({ title: pull.title, body, repo: { owner: repo.owner, name: repo.name } });
    const resolved = await resolveSources({
      github: () => this.container.github(),
      repo: { owner: repo.owner, name: repo.name },
      headSha: pull.headSha,
      refs,
    });
    const issueSources: IntentSource[] = resolved.sources.filter((s) => s.kind === 'issue');
    const issues = resolved.promptSources
      .filter((s) => s.kind === 'issue' && s.status === 'ok' && s.text)
      .map((s) => ({ ref: s.ref, text: s.text! }));

    const docs = await this.gatherDocs(workspaceId, repo, resolved.promptSources);

    const input: BriefPromptInput = {
      title: pull.title,
      body,
      intent: intentRec
        ? {
            summary: intentRec.summary,
            in_scope: intentRec.in_scope,
            out_of_scope: intentRec.out_of_scope,
            confidence: intentRec.confidence,
            stale: intentRec.stale,
          }
        : null,
      blast: blast === 'unavailable' ? null : toPromptBlast(blast),
      files: files.map((f) => ({
        path: f.path,
        role: classifyFile(f.path),
        additions: f.additions,
        deletions: f.deletions,
        hunkHeaders: hunkHeaders(f.patch),
      })),
      issues,
      docs: docs.texts,
    };

    // ---- prompt ----
    const model = await resolveFeatureModel(this.container, workspaceId, 'risk_brief');
    const verbose = this.container.config.promptLogVerbose;
    const { messages, sections, trim } = buildBriefMessages(input, {
      countTokens: (t) => tokenizer.count(t),
      meter: makeMeter(tokenizer, verbose),
    });
    logger?.info(
      buildPromptAssembledEvent(
        {
          correlationId,
          prId: pull.id,
          provider: model.provider,
          model: model.model,
          promptKind: 'brief',
          promptVersion: BRIEF_PROMPT_VERSION,
          sections,
        },
        { verbose },
      ),
      PROMPT_ASSEMBLED_MSG,
    );

    // ---- one request, no retry ----
    const llm = await this.container.llm(model.provider, { retries: 0 });
    let result;
    try {
      result = await llm.completeStructured({
        model: model.model,
        schema: BriefModelOutput,
        schemaName: 'BriefModelOutput',
        messages,
        temperature: 0,
        maxTokens: BRIEF_MAX_OUTPUT_TOKENS,
        timeoutMs: BRIEF_TIMEOUT_MS,
        maxRetries: 0,
        sessionId: `${repo.owner}/${repo.name}#${pull.number}:brief`,
      });
    } catch (err) {
      if (err instanceof ConfigError) throw err;
      // R1: a provider error may echo model output (derived from PR text); keep only its label, drop details.
      throw new ExternalServiceError(`Brief generation failed (${errorLabel(err)})`);
    }

    // ---- validate, store ----
    const checked = validateBriefOutput(result.data, {
      files: files.map((f) => ({ path: f.path, patch: f.patch })),
      blast: blast === 'unavailable' ? null : blast,
    });
    const inputs = buildBriefProvenance({
      intent: !intentRec ? 'none' : intentRec.stale ? 'stale' : 'ok',
      blast,
      trim,
      body,
      issues: issueSources,
      docs: docs.provenance,
    });
    const durationMs = Date.now() - started;
    const brief: PrBrief = {
      summary: checked.summary,
      risks: checked.risks,
      review_focus: checked.review_focus,
      head_sha: pull.headSha,
      generated_at: new Date().toISOString(),
      prompt_version: BRIEF_PROMPT_VERSION,
      input_hash: briefInputHash(pull.title, body),
      provider: model.provider,
      model: model.model,
      tokens_in: result.tokensIn,
      tokens_out: result.tokensOut,
      cost_usd: result.costUsd ?? null,
      duration_ms: durationMs,
      attempts: result.attempts,
      inputs,
      dropped: checked.dropped,
    };
    await this.repo.replace(pull.id, brief);

    // Metrics, ids and statuses only — never PR, issue, document or model text.
    logger?.info(
      {
        prId: pull.id,
        correlationId,
        provider: model.provider,
        model: model.model,
        tokensIn: brief.tokens_in,
        tokensOut: brief.tokens_out,
        costUsd: brief.cost_usd,
        durationMs,
        attempts: brief.attempts,
        statuses: inputs.map((i) => ({ kind: i.kind, status: i.status })),
        dropped: brief.dropped,
      },
      'brief: generated',
    );
    return brief;
  }

  /**
   * Spec documents: PR-linked ones first, then those attached to enabled agents and their usable
   * skills (kind `specs` only). The first copy of a path wins; the budget is `specTokens`.
   */
  private async gatherDocs(
    workspaceId: string,
    repo: RepoRow,
    linked: { kind: string; ref: string; status: string; text?: string }[],
  ): Promise<{ texts: { ref: string; text: string }[]; provenance: { ref: string; status: Status }[] }> {
    const provenance: { ref: string; status: Status }[] = [];
    const reads: ContextRead[] = [];
    const seen = new Set<string>();

    for (const s of linked) {
      if (s.kind !== 'spec' && s.kind !== 'plan') continue;
      if (seen.has(s.ref)) continue;
      seen.add(s.ref);
      if (s.status === 'ok' && s.text !== undefined) {
        reads.push({ path: s.ref, origin: 'linked', read: { ok: true, content: s.text, size: Buffer.byteLength(s.text) } });
      } else {
        provenance.push({ ref: s.ref, status: 'unavailable' });
      }
    }

    const entries: ContextEntry[] = [];
    const agents = await this.container.agentsRepo.listEnabled(workspaceId);
    for (const agent of agents) {
      const { allowed } = partitionBlockedSkills(await this.container.skillsRepo.effectiveSkillsForAgent(agent.id));
      const agentPaths = await this.container.contextDocsRepo.pathsForAgent(agent.id);
      const skillPaths = await this.container.contextDocsRepo.pathsForSkills(allowed.map((s) => s.id));
      const ordered = orderContextPaths(
        agentPaths,
        allowed.map((s) => ({ name: s.name, paths: skillPaths.get(s.id) ?? [] })),
      );
      for (const e of ordered) {
        if (seen.has(e.path) || docKind(e.path) !== 'specs') continue;
        seen.add(e.path);
        entries.push(e);
      }
    }
    const attached = await readProjectDocs(
      this.container.docs,
      repo.clonePath ?? null,
      entries,
      makeRootMatcher(this.container.config.projectContextRoots),
    );
    reads.push(...attached);

    const plan = buildProjectContextPlan(reads, this.container.tokenizer, { maxTokens: BRIEF_BUDGET.specTokens });
    for (const b of plan.blocks) provenance.push({ ref: b.path, status: b.truncated ? 'truncated' : 'ok' });
    for (const s of plan.skipped) {
      provenance.push({ ref: s.path, status: s.reason === 'over_budget' ? 'over_budget' : 'unavailable' });
    }
    return { texts: plan.blocks.map((b) => ({ ref: b.path, text: b.text })), provenance };
  }
}
