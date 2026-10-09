import type { IntentSource, PrIntentResponse } from '@devdigest/shared';
import { IntentClassification } from '@devdigest/shared';
import {
  buildIntentMessages,
  computeIntentConfidence,
  minConfidence,
  INTENT_PROMPT_VERSION,
  type IntentPromptFile,
  type ReviewIntent,
} from '@devdigest/reviewer-core';
import type { Container } from '../../platform/container.js';
import { AppError, ExternalServiceError, NotFoundError } from '../../platform/errors.js';
import type { PullRow } from '../../db/rows.js';
import * as schema from '../../db/schema.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { ReviewRepository } from '../reviews/repository.js';
import { loadDiff } from '../reviews/diff-loader.js';
import {
  CLASSIFY_MAX_RETRIES,
  CLASSIFY_MAX_TOKENS,
  CLASSIFY_TEMPERATURE,
  CLASSIFY_TIMEOUT_MS,
  MAX_MISSING_ITEMS,
  MAX_REF_CHARS,
} from './constants.js';
import {
  clampClassification,
  deriveStaleness,
  extractHunkHeaders,
  extractReferences,
  hasFetchedExplicitSource,
  intentInputHash,
  toIntentRecordDto,
} from './helpers.js';
import { IntentRepository } from './repository.js';
import { missingContextLines, resolveSources } from './source-resolver.js';
import type { UnifiedDiff } from '@devdigest/shared';

type RepoRow = typeof schema.repos.$inferSelect;

/** Where classification progress goes: pino for the HTTP route, the fan-out RunLogger for reviews. Data must be safe (sizes, refs, statuses). */
export type IntentLog = (msg: string, data?: Record<string, unknown>) => void;

/** Minimal pino-compatible logger the HTTP route passes (`req.log`). */
export type PinoLike = {
  info: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};

const clip = (s: string, n: number): string => (s.length > n ? s.slice(0, n) : s);

/** Error text that is safe to log: our own AppError messages, else just the class name. */
export function safeErrorLabel(err: unknown): string {
  if (err instanceof AppError) return clip(err.message, 160);
  return err instanceof Error ? err.name : 'Error';
}

export class IntentService {
  private repo: IntentRepository;
  private reviews: ReviewRepository;

  constructor(private container: Container) {
    this.repo = new IntentRepository(container.db);
    this.reviews = new ReviewRepository(container.db);
  }

  private async requirePull(workspaceId: string, prId: string): Promise<{ pull: PullRow; repo: RepoRow }> {
    const pull = await this.reviews.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await this.reviews.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return { pull, repo };
  }

  /** The stored intent with a freshly derived `stale` flag, or `{intent:null}`. */
  async get(workspaceId: string, prId: string): Promise<PrIntentResponse> {
    const { pull } = await this.requirePull(workspaceId, prId);
    return this.respond(pull);
  }

  private async respond(pull: PullRow): Promise<PrIntentResponse> {
    const row = await this.repo.get(pull.id);
    if (!row) return { intent: null };
    return { intent: toIntentRecordDto(pull.id, row, this.staleness(pull, row)) };
  }

  private staleness(pull: PullRow, row: NonNullable<Awaited<ReturnType<IntentRepository['get']>>>) {
    return deriveStaleness(row, {
      headSha: pull.headSha,
      title: pull.title,
      body: pull.body ?? '',
      promptVersion: INTENT_PROMPT_VERSION,
    });
  }

  /** POST: classify now (always), store, return the fresh record. */
  async detect(workspaceId: string, prId: string, logger?: PinoLike): Promise<PrIntentResponse> {
    const { pull, repo } = await this.requirePull(workspaceId, prId);
    const diff = await loadDiff(this.container, this.reviews, workspaceId, pull, repo);
    const log: IntentLog = (msg, data) => logger?.info({ prId, ...data }, msg);
    try {
      await this.classify(workspaceId, pull, repo, diff, log);
    } catch (err) {
      logger?.error({ prId, err: safeErrorLabel(err) }, 'intent: classification failed');
      throw err;
    }
    return this.respond(pull);
  }

  /**
   * The intent a review run should use. Classifies once when none is stored; a
   * stale intent is used as context (never re-classified) and keeps the scope
   * filter off. Never throws: any failure degrades to "no intent".
   */
  async forReview(
    workspaceId: string,
    pull: PullRow,
    repo: RepoRow,
    diff: UnifiedDiff,
    log: IntentLog,
  ): Promise<{ intent: ReviewIntent | null; scopeFilter: boolean }> {
    try {
      let row = await this.repo.get(pull.id);
      if (!row) {
        log('No stored intent — classifying before the agents run');
        await this.classify(workspaceId, pull, repo, diff, log);
        row = await this.repo.get(pull.id);
      }
      if (!row) return { intent: null, scopeFilter: false };
      const reason = this.staleness(pull, row);
      const stale = reason !== null;
      const fetched = hasFetchedExplicitSource(row.sources);
      const scopeFilter = !stale && row.confidence !== 'low' && fetched;
      log(
        stale
          ? `Intent is stale (${reason}) — used as context only, not re-classified; scope filter off`
          : scopeFilter
            ? `Using intent (confidence ${row.confidence}) — scope filter on`
            : row.confidence === 'low'
              ? `Using intent (confidence ${row.confidence}) — low confidence, scope filter off`
              : `Using intent (confidence ${row.confidence}) — no fetched issue/spec/plan — scope filter off`,
      );
      return {
        intent: {
          summary: row.summary,
          in_scope: row.inScope,
          out_of_scope: row.outOfScope,
          confidence: row.confidence,
          missing_context: row.missingContext,
          stale,
        },
        scopeFilter,
      };
    } catch (err) {
      // Intent is an optional prompt slot: the review still runs without it.
      log(`Intent unavailable (${safeErrorLabel(err)}) — reviewing without it`);
      return { intent: null, scopeFilter: false };
    }
  }

  /** Files for the prompt: paths + counts + hunk headers only (never hunk bodies). */
  private async promptFiles(pull: PullRow, diff: UnifiedDiff): Promise<IntentPromptFile[]> {
    if (diff.files.length > 0) {
      const headers = extractHunkHeaders(diff.raw);
      return diff.files.map((f) => ({
        path: f.path,
        additions: f.additions,
        deletions: f.deletions,
        hunkHeaders: headers[f.path] ?? [],
      }));
    }
    const rows = await this.reviews.getPrFiles(pull.id);
    return rows.map((r) => ({ path: r.path, additions: r.additions, deletions: r.deletions, hunkHeaders: [] }));
  }

  /**
   * Gather evidence → one cheap structured LLM call → clamp → upsert. Throws on
   * LLM/config failure (the caller decides whether that fails a request or just
   * degrades a review).
   */
  async classify(
    workspaceId: string,
    pull: PullRow,
    repo: RepoRow,
    diff: UnifiedDiff,
    log: IntentLog,
  ): Promise<void> {
    const started = Date.now();
    const body = pull.body ?? '';
    const [commits, files] = await Promise.all([this.repo.commitMessages(pull.id), this.promptFiles(pull, diff)]);

    const refs = extractReferences({ title: pull.title, body, repo: { owner: repo.owner, name: repo.name } });
    const resolved = await resolveSources({
      github: () => this.container.github(),
      repo: { owner: repo.owner, name: repo.name },
      headSha: pull.headSha,
      refs,
    });

    const fixed: IntentSource[] = [
      { kind: 'pr_title', ref: 'title', status: 'ok' },
      ...(body.trim() ? [{ kind: 'pr_body', ref: 'description', status: 'ok' } as IntentSource] : []),
      ...(pull.branch ? [{ kind: 'branch', ref: clip(pull.branch, MAX_REF_CHARS), status: 'ok' } as IntentSource] : []),
      ...(commits.length > 0 ? [{ kind: 'commits', ref: `${commits.length} commit(s)`, status: 'ok' } as IntentSource] : []),
      { kind: 'files', ref: `${files.length} file(s)`, status: 'ok' },
    ];
    const sources: IntentSource[] = [...fixed, ...resolved.sources];

    const { messages, components } = buildIntentMessages({
      title: pull.title,
      body,
      branch: pull.branch ?? '',
      commits,
      sources: resolved.promptSources,
      files,
    });

    const model = await resolveFeatureModel(this.container, workspaceId, 'review_intent');
    const tokenEstimate = this.container.tokenizer.count(messages[1]!.content);
    const totalChars = Math.max(1, components.reduce((n, c) => n + c.chars, 0));
    log('intent: classifying', {
      provider: model.provider,
      model: model.model,
      promptVersion: INTENT_PROMPT_VERSION,
      components: components.map((c) => ({
        name: c.name, // section label; refs inside are already sanitised
        chars: c.chars,
        tokens: Math.round((tokenEstimate * c.chars) / totalChars),
      })),
      tokenEstimate,
      sources: sources.map((s) => ({ kind: s.kind, ref: s.ref, status: s.status })),
    });

    const llm = await this.container.llm(model.provider);
    let result;
    try {
      result = await llm.completeStructured({
        model: model.model,
        schema: IntentClassification,
        schemaName: 'IntentClassification',
        messages,
        temperature: CLASSIFY_TEMPERATURE,
        maxTokens: CLASSIFY_MAX_TOKENS,
        timeoutMs: CLASSIFY_TIMEOUT_MS,
        maxRetries: CLASSIFY_MAX_RETRIES,
        sessionId: `${repo.owner}/${repo.name}#${pull.number}:intent`,
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      // The cause may echo model output (derived from PR text): keep only its class in the message.
      throw new ExternalServiceError(`Intent classification failed (${safeErrorLabel(err)})`);
    }

    const clamped = clampClassification(result.data);
    const confidence = minConfidence(
      computeIntentConfidence({ body, sources: sources.map((s) => ({ kind: s.kind, status: s.status })) }),
      clamped.confidence,
    );
    const missing = [...new Set([...missingContextLines(sources), ...clamped.missing_context])].slice(
      0,
      MAX_MISSING_ITEMS,
    );
    const durationMs = Date.now() - started;

    await this.repo.upsert(pull.id, {
      summary: clamped.summary,
      inScope: clamped.in_scope,
      outOfScope: clamped.out_of_scope,
      confidence,
      sources,
      missingContext: missing,
      headSha: pull.headSha,
      inputHash: intentInputHash({ promptVersion: INTENT_PROMPT_VERSION, title: pull.title, body }),
      provider: model.provider,
      model: model.model,
      promptVersion: INTENT_PROMPT_VERSION,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      durationMs,
      costUsd: result.costUsd ?? null,
    });
    log('intent: done', {
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: result.costUsd ?? null,
      durationMs,
      confidence,
      missingContext: missing.length,
    });
  }
}
