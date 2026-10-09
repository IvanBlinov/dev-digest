import { randomUUID } from 'node:crypto';
import type { Container } from '../../platform/container.js';
import type { Provider, Review, RunTrace, UnifiedDiff } from '@devdigest/shared';
import {
  reviewPullRequest,
  countBlockers,
  type ReviewIntent,
  type ReviewOutcome,
} from '@devdigest/reviewer-core';
import { RunLogger } from '../../platform/run-logger.js';
import {
  PROMPT_ASSEMBLED_MSG,
  buildPromptAssembledEvent,
  makeMeter,
  promptSummaryLine,
} from '../../platform/prompt-log.js';
import * as schema from '../../db/schema.js';
import type { AgentRow } from '../../db/rows.js';
import type { ReviewRepository, FindingRow, PullRow, ReviewRow } from './repository.js';
import { REVIEW_STRATEGY } from './constants.js';
import { taskLine } from './helpers.js';
import { loadDiff } from './diff-loader.js';
import { IntentService } from '../intent/service.js';
import { runAgentsConcurrently } from './concurrency.js';
import {
  blockedSkillsLogLine,
  buildSkillsPrompt,
  partitionBlockedSkills,
  skillsLogLine,
  type EffectiveSkillsSource,
} from './skills-prompt.js';

/** Thrown by a run when the user cancels it mid-flight (between map files). */
export class RunCancelledError extends Error {
  constructor() {
    super('Run cancelled');
    this.name = 'RunCancelledError';
  }
}

/** Minimal structured logger (pino-compatible: (obj, msg)) for runtime logs. */
export type Logger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
  debug: (obj: unknown, msg?: string) => void;
};

// A reduced "Review per file" — same schema as Review (the model returns a small
// Review per file; we merge findings + take the worst verdict / mean score).
export type RunOutcome = {
  review: ReviewRow;
  findings: FindingRow[];
  grounding: string;
  raw: Review;
};

/** Per-execution inputs shared by every agent of one review run. */
interface ExecCtx {
  workspaceId: string;
  pull: PullRow;
  repo: typeof schema.repos.$inferSelect;
  diff: UnifiedDiff;
  intent: ReviewIntent | null;
  /** Fresh intent with confidence ≠ low → out-of-scope findings are filtered. */
  scopeFilter: boolean;
  runLog: RunLogger;
  logger: Logger | undefined;
  /** One ID per review execution: ties every `prompt.assembled` event + each run trace together. */
  correlationId: string;
}

/** One agent's in-memory result between compute and finalize. */
interface AgentComputation {
  agent: AgentRow;
  runId: string;
  /** Index of the job in this execution (log ordering). */
  order: number;
  start: number;
  runLog: RunLogger;
  outcome: ReviewOutcome;
  skillsPlan: ReturnType<typeof buildSkillsPrompt>;
}

/**
 * Owns the background execution of queued agent runs (extracted from
 * ReviewService; behaviour unchanged). Loads the diff + intent once, then
 * map-reduces each agent, streaming events over the runBus and persisting each
 * review. Per-agent failures are isolated.
 */
export class ReviewRunExecutor {
  constructor(
    private container: Container,
    private repo: ReviewRepository,
    private agents: Container['agentsRepo'],
    private skills: EffectiveSkillsSource,
  ) {}

  /**
   * Background execution of the queued agent runs (NOT awaited by the route).
   * Loads the diff + intent once, then runs each agent (bounded concurrency),
   * streaming events over the runBus and persisting each review. Per-agent
   * failures are isolated.
   *
   * Each queue task computes AND finalizes (persists) its agent as soon as that
   * agent is done; the scope filter (if on) is applied per agent inside the engine.
   */
  async executeRuns(
    workspaceId: string,
    pull: PullRow,
    repo: typeof schema.repos.$inferSelect,
    jobs: { agent: AgentRow; runId: string }[],
    logger?: Logger,
  ): Promise<void> {
    // ONE logger fanned out over every queued run: shared pre-work (diff +
    // intent) is streamed into each target agent's Live Log and persisted into
    // each run's trace. Per-agent work below narrows it to a single run.
    const correlationId = randomUUID();
    const runLog = new RunLogger(
      this.container.runBus,
      jobs.map((j) => j.runId),
      logger,
      { prId: pull.id, correlationId },
    );

    // Pre-work failure (e.g. diff load) fails EVERY queued run. The error was
    // already emitted via runLog (fanned out → in each run's buffer); here we
    // mark the rows failed and persist the buffered log so it survives a reload.
    const failAll = async (msg: string) => {
      for (const { runId, agent } of jobs) {
        await this.repo
          .completeAgentRun(runId, {
            status: 'failed',
            durationMs: 0,
            tokensIn: 0,
            tokensOut: 0,
            findingsCount: 0,
            grounding: '0/0 passed',
            error: msg,
            costUsd: null,
          })
          .catch(() => undefined);
        await this.repo
          .saveRunTrace(runId, this.traceFromBuffer(runId, pull, agent, '0/0 passed', 0, correlationId))
          .catch(() => undefined);
        this.container.runBus.complete(runId);
      }
    };

    let diff: UnifiedDiff;
    try {
      diff = await runLog.step('Loading PR diff', () => loadDiff(this.container, this.repo, workspaceId, pull, repo), {
        kind: 'tool',
      });
    } catch (err) {
      runLog.error(`Failed to load PR diff: ${(err as Error).message}`);
      await failAll(`Failed to load PR diff: ${(err as Error).message}`);
      return;
    }

    // PR intent (optional prompt slot): load the stored one or classify once for
    // the whole execution. Never fails the run — see IntentService.forReview.
    const { intent, scopeFilter } = await runLog.step(
      'Loading PR intent',
      () =>
        new IntentService(this.container).forReview(workspaceId, pull, repo, diff, (m, d) => runLog.info(m, d), {
          logger,
          correlationId,
        }),
      { kind: 'tool' },
    );
    runLog.info(`Diff ready — ${diff.files.length} changed file(s); starting ${jobs.length} agent run(s)`);

    const ctx: ExecCtx = { workspaceId, pull, repo, diff, intent, scopeFilter, runLog, logger, correlationId };
    const concurrency = this.container.config.reviewAgentConcurrency;

    // Each run finishes (and persists) on its own, as soon as its agent is done.
    await runAgentsConcurrently(jobs, concurrency, async (job) => {
      const order = jobs.indexOf(job);
      const startedAt = this.logAgentStart(ctx, job);
      try {
        const comp = await this.computeAgent(ctx, job, order, startedAt);
        const outcome = await this.finalizeAgent(ctx, comp);
        this.logAgentDone(ctx, comp, outcome);
      } catch (err) {
        await this.failAgent(ctx, job, startedAt, err);
      }
    });
  }

  private logAgentStart(ctx: ExecCtx, { agent, runId }: { agent: AgentRow; runId: string }): number {
    ctx.logger?.info(
      { runId, agent: agent.name, provider: agent.provider, model: agent.model, prId: ctx.pull.id, correlationId: ctx.correlationId },
      `review: agent "${agent.name}" started (${agent.provider}/${agent.model})`,
    );
    return Date.now();
  }

  private logAgentDone(ctx: ExecCtx, comp: AgentComputation, outcome: RunOutcome): void {
    ctx.logger?.info(
      {
        runId: comp.runId,
        correlationId: ctx.correlationId,
        agent: comp.agent.name,
        findings: outcome.findings.length,
        grounding: outcome.grounding,
        durationMs: Date.now() - comp.start,
      },
      `review: agent "${comp.agent.name}" done — ${outcome.findings.length} finding(s)`,
    );
  }

  /**
   * Compute one agent's review IN MEMORY (LLM + engine). Persists nothing and
   * never completes the run — `finalizeAgent` / `failAgent` own that.
   */
  private async computeAgent(
    ctx: ExecCtx,
    { agent, runId }: { agent: AgentRow; runId: string },
    order: number,
    start: number,
  ): Promise<AgentComputation> {
    const { pull, repo, diff, intent } = ctx;
    const verbose = this.container.config.promptLogVerbose;
    // Narrow the fanned-out pre-work logger to THIS run; the shared diff/intent
    // events are already in this run's buffer, so the persisted trace
    // (built from the buffer) includes them too.
    const runLog = ctx.runLog.forRun(runId, { agent: agent.name });

    runLog.info(`Starting review with agent "${agent.name}" (${agent.provider}/${agent.model})`);

    // Resolve the agent's LLM provider. (container.llm throws if the provider
    // key is missing — persisted by failAgent as a failed run.)
    const llm = await runLog.step(
      `Resolving ${agent.provider} provider`,
      () => this.container.llm(agent.provider as Provider),
      { kind: 'tool' },
    );

    // Per-agent repo-intel toggle (Agent editor). When an agent opts out we
    // skip all enrichment entirely so its prompt is identical to the
    // repo-intel-off baseline — independent of the global REPO_INTEL_ENABLED
    // flag, which still gates the facade internally.
    const repoIntelOn = agent.repoIntel !== false;
    if (!repoIntelOn) runLog.info('Repo intel disabled for this agent — skipping context enrichment');

    // T1.3 — callers-in-prompt. Best-effort: when repo-intel is off the facade
    // returns []; we omit the section and behavior is identical to the
    // pre-T1.3 prompt (acceptance #10).
    const callersDigest = repoIntelOn ? await this.buildCallersDigest(pull.repoId, diff, runLog) : undefined;

    // T3 — repo skeleton + "changed files are top-5%" framing. Both best-
    // effort: when repo-intel is off / unindexed the facade degrades and the
    // prompt is identical to the pre-T3 shape.
    const repoMap = repoIntelOn ? await this.buildRepoMapDigest(pull.repoId, runLog) : undefined;
    const rankNote = repoIntelOn ? await this.buildRankNote(pull.repoId, diff, runLog) : '';

    const task = taskLine(pull) + rankNote;

    // L02 — the agent's effective skills (link.enabled AND skill.enabled, in
    // link order) become `### Skill:` blocks in the prompt, in that order.
    // A lookup failure fails the run: a review silently missing its rules
    // would look valid but answer a different question.
    // L03b — skills with prompt-injection findings never reach the prompt,
    // even when their link is enabled; the run log names them.
    const { allowed: usableSkills, blocked: blockedSkills } = partitionBlockedSkills(
      await this.skills.effectiveSkillsForAgent(agent.id),
    );
    const blockedLine = blockedSkillsLogLine(blockedSkills);
    if (blockedLine) runLog.info(blockedLine);
    const skillsPlan = buildSkillsPrompt(usableSkills, this.container.tokenizer);
    runLog.info(skillsLogLine(skillsPlan));

    // ---- Engine: assemble → single-pass → grounding -----------------------
    // The pure review pipeline lives in @devdigest/reviewer-core (shared with
    // the CI runner). The service owns only I/O: repo-intel context resolution
    // above, and persistence + observability in finalizeAgent.
    const outcome = await reviewPullRequest({
      systemPrompt: agent.systemPrompt,
      model: agent.model,
      diff,
      llm,
      // Per-agent review strategy (configured in the Agent editor); falls back
      // to the studio default. single-pass = whole diff in one call.
      strategy: agent.strategy ?? REVIEW_STRATEGY,
      // T1.3 — pass the callers digest only when we built one. assemblePrompt
      // omits the section when this is empty/undefined.
      ...(callersDigest ? { callers: callersDigest } : {}),
      // T3 — repo skeleton, same omit-when-empty contract.
      ...(repoMap ? { repoMap } : {}),
      // L02 — omitted when no skill is enabled (prompt identical to pre-L02).
      ...(skillsPlan.texts.length > 0 ? { skills: skillsPlan.texts } : {}),
      // PR author's description/body — untrusted; assemblePrompt wraps +
      // truncates it. Omitted when the PR has no body.
      ...(pull.body ? { prDescription: pull.body } : {}),
      // PR intent — an unverified hypothesis (untrusted-wrapped by assemblePrompt).
      // The scope filter is on only for a fresh, non-low-confidence intent.
      ...(intent ? { intent } : {}),
      ...(intent && ctx.scopeFilter ? { scopeFilter: true } : {}),
      task,
      // Prompt-assembly logging: counting is injected (the core stays pure).
      // The structured event goes to pino ONLY (runLog publishes data to SSE);
      // the Live Log gets one short summary line.
      promptMeter: makeMeter(this.container.tokenizer, verbose),
      onPromptAssembled: (info) => {
        const event = buildPromptAssembledEvent(
          {
            correlationId: ctx.correlationId,
            runId,
            prId: pull.id,
            agent: agent.name,
            provider: agent.provider,
            model: agent.model,
            promptKind: 'review',
            mode: info.mode,
            chunk: info.chunk,
            sections: info.sections,
            diff,
            skillBlocks: skillsPlan.blocks.map((b) => ({ name: b.name, version: b.version, tokens: b.tokens })),
          },
          { verbose },
        );
        ctx.logger?.info(event, PROMPT_ASSEMBLED_MSG);
        runLog.info(promptSummaryLine(event));
      },
      sessionId: `${repo.owner}/${repo.name}#${pull.number}:${agent.name}`,
      onEvent: (e) => runLog.event(e.kind, e.msg, e.data),
      checkCancelled: () => {
        if (this.container.runBus.isCancelled(runId)) throw new RunCancelledError();
      },
    });

    return { agent, runId, order, start, runLog, outcome, skillsPlan };
  }

  /**
   * Persist a computed agent run: review + findings, agent_runs row, trace.
   * Completes the run on the bus. Throws on failure (callers use `failAgent`).
   */
  private async finalizeAgent(
    ctx: ExecCtx,
    comp: AgentComputation,
  ): Promise<RunOutcome> {
    const { workspaceId, pull } = ctx;
    const { agent, runId, runLog, outcome, skillsPlan } = comp;
    const { tokensIn, tokensOut, grounding, costUsd } = outcome;

    const finalReview = outcome.review;
    const keptFindings = finalReview.findings;

    // ---- Persist review + findings ----------------------------------------
    const review = await this.repo.insertReview({
      workspaceId,
      prId: pull.id,
      agentId: agent.id,
      runId,
      kind: 'review',
      verdict: finalReview.verdict,
      summary: finalReview.summary,
      score: finalReview.score,
      model: agent.model,
    });
    const findingRows = await this.repo.insertFindings(review.id, keptFindings);
    runLog.result(`Persisted review ${review.id} with ${findingRows.length} finding(s)`);

    // Mark the commit this review ran against so the PR list can tell
    // reviewed / needs-review (head moved) / stale apart.
    await this.repo.markReviewed(pull.id, pull.headSha);

    const durationMs = Date.now() - comp.start;

    // Deterministic blocker count (severity ≥ the agent's gate) — the signal
    // the timeline colors on, NOT the model's self-reported verdict.
    const blockers = countBlockers(keptFindings, agent.ciFailOn);

    // ---- Observability: agent_runs + ONE run_traces document --------------
    await this.repo.completeAgentRun(runId, {
      status: 'done',
      durationMs,
      tokensIn,
      tokensOut,
      findingsCount: findingRows.length,
      grounding,
      score: finalReview.score,
      blockers,
      error: null,
      costUsd,
    });

    const trace: RunTrace = {
      config: {
        agent: agent.name,
        version: String(agent.version),
        provider: agent.provider,
        model: agent.model,
        pr: pull.number,
        source: 'local',
        correlation_id: ctx.correlationId,
      },
      stats: {
        duration_ms: durationMs,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        findings: findingRows.length,
        grounding,
        cost_usd: costUsd,
      },
      prompt_assembly: {
        ...outcome.assembly,
        skills_blocks: skillsPlan.blocks.length > 0 ? skillsPlan.blocks : null,
        skills_tokens: skillsPlan.totalTokens,
      },
      tool_calls: outcome.chunks.map((c) => ({
        tool: 'review_file',
        args: c.label,
        meta: outcome.mode,
        ms: Math.round(durationMs / Math.max(outcome.chunks.length, 1)),
      })),
      raw_output: outcome.raw,
      memory_pulled: [],
      specs_read: [],
      // Persisted log = the run's FULL event buffer (incl. shared pre-work:
      // diff load + intent), not just events recorded inside this method.
      log: runLog.logFor(runId),
    };
    runLog.info('Run complete; trace persisted');
    await this.repo.saveRunTrace(runId, trace);
    this.container.runBus.complete(runId);

    return { review, findings: findingRows, grounding, raw: finalReview };
  }

  /**
   * Failure/cancel: persist status + the error text + the log-so-far so the
   * run (and WHY it failed) is visible on the UI after a reload. Never throws.
   */
  private async failAgent(
    ctx: ExecCtx,
    { agent, runId }: { agent: AgentRow; runId: string },
    start: number,
    err: unknown,
  ): Promise<void> {
    const runLog = ctx.runLog.forRun(runId, { agent: agent.name });
    const cancelled = err instanceof RunCancelledError;
    const status = cancelled ? 'cancelled' : 'failed';
    const msg = cancelled ? 'Cancelled by user' : (err as Error).message;
    runLog.error(cancelled ? 'Run cancelled by user' : `Run failed: ${msg}`);
    await this.repo
      .completeAgentRun(runId, {
        status,
        durationMs: Date.now() - start,
        tokensIn: 0,
        tokensOut: 0,
        findingsCount: 0,
        grounding: '0/0 passed',
        error: msg,
        costUsd: null,
      })
      .catch(() => undefined);
    await this.repo
      .saveRunTrace(runId, this.traceFromBuffer(runId, ctx.pull, agent, '0/0 passed', Date.now() - start, ctx.correlationId))
      .catch(() => undefined);
    this.container.runBus.complete(runId);
    ctx.logger?.[cancelled ? 'info' : 'error'](
      { runId, agent: agent.name, err: msg, durationMs: Date.now() - start },
      `review: agent "${agent.name}" ${cancelled ? 'cancelled' : 'failed'}`,
    );
  }

  /**
   * Build a compact "Callers of changed symbols" digest for the prompt.
   *
   * Returns `undefined` when nothing should be added (flag off, no callers
   * found, or repo-intel errors) — `reviewPullRequest` omits the section in
   * that case (acceptance #10: flag off → identical prompt).
   *
   * Compact format: one bullet per caller, grouped by file. Trimmed (limit 10
   * rows per `getCallerSignatures` call) so the section stays under ~600
   * tokens even on heavy PRs.
   */
  private async buildCallersDigest(
    repoId: string,
    diff: UnifiedDiff,
    runLog: RunLogger,
  ): Promise<string | undefined> {
    const changedFiles = diff.files.map((f) => f.path);
    if (changedFiles.length === 0) return undefined;
    let rows;
    try {
      rows = await this.container.repoIntel.getCallerSignatures(repoId, changedFiles, 10);
    } catch (err) {
      // Never let an enrichment break the run — surface only as a Live Log info.
      runLog.info(`callers digest: repoIntel failed — ${(err as Error).message}`);
      return undefined;
    }
    if (rows.length === 0) return undefined;

    const byFile = new Map<string, string[]>();
    for (const r of rows) {
      const lines = byFile.get(r.file) ?? [];
      lines.push(`- \`${r.symbol}\` — ${r.signature}`);
      byFile.set(r.file, lines);
    }
    const out: string[] = [];
    for (const [file, lines] of byFile) {
      out.push(`### ${file}`);
      out.push(...lines);
    }
    runLog.info(`callers digest: ${rows.length} caller signature(s) attached`);
    return out.join('\n');
  }

  /**
   * T3 — fetch the cached repo skeleton for the prompt's `## Repo skeleton`
   * slot. Returns `undefined` when repo-intel is off / the repo isn't indexed
   * (the facade degrades), so the prompt stays identical to the pre-T3 shape.
   */
  private async buildRepoMapDigest(
    repoId: string,
    runLog: RunLogger,
  ): Promise<string | undefined> {
    try {
      const map = await this.container.repoIntel.getRepoMap(repoId);
      if (map.degraded || map.text.trim().length === 0) return undefined;
      runLog.info(`repo map: ${map.tokens} token(s) attached (cached=${map.cached})`);
      return map.text;
    } catch (err) {
      runLog.info(`repo map: repoIntel failed — ${(err as Error).message}`);
      return undefined;
    }
  }

  /**
   * T3 — a one-line "N of M changed files are in the top 5% most-depended-on"
   * note appended to the task framing, so the model prioritises hot core files.
   * Empty string when repo-intel is off / no changed file is hot.
   */
  private async buildRankNote(
    repoId: string,
    diff: UnifiedDiff,
    runLog: RunLogger,
  ): Promise<string> {
    const changedFiles = diff.files.map((f) => f.path);
    if (changedFiles.length === 0) return '';
    try {
      const ranks = await this.container.repoIntel.getFileRank(repoId, changedFiles);
      if (ranks.length === 0) return '';
      const hot = ranks.filter((r) => r.percentile >= 95);
      if (hot.length === 0) return '';
      runLog.info(`file rank: ${hot.length}/${changedFiles.length} changed file(s) in top 5%`);
      return `\n\n${hot.length} of ${changedFiles.length} changed file(s) are in the top 5% most-depended-on (high blast risk) — prioritise their correctness.`;
    } catch {
      return '';
    }
  }

  /**
   * A minimal RunTrace whose `log` is the run's full SSE buffer — persisted on
   * failure/cancel (and pre-work failures) so the events (and WHY it failed)
   * survive a reload, not just the in-memory stream.
   */
  private traceFromBuffer(
    runId: string,
    pull: PullRow,
    agent: AgentRow,
    grounding: string,
    durationMs = 0,
    correlationId?: string,
  ): RunTrace {
    return {
      config: {
        agent: agent.name,
        version: String(agent.version),
        provider: agent.provider,
        model: agent.model,
        pr: pull.number,
        source: 'local',
        ...(correlationId ? { correlation_id: correlationId } : {}),
      },
      stats: { duration_ms: durationMs, tokens_in: 0, tokens_out: 0, findings: 0, grounding, cost_usd: null },
      prompt_assembly: {
        system: agent.systemPrompt,
        skills: null,
        skills_blocks: null,
        skills_tokens: null,
        memory: null,
        specs: null,
        user: '',
      },
      tool_calls: [],
      raw_output: '',
      memory_pulled: [],
      specs_read: [],
      log: this.container.runBus.buffer(runId).map((e) => ({ t: e.t, kind: e.kind, msg: e.msg })),
    };
  }
}
