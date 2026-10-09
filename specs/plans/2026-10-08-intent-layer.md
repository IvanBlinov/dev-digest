# Development Plan: Intent Layer (PR intent classifier, scope-aware review, Intent card)

**Spec:** none. Step S0 writes `specs/L03-intent-layer.md` · **Base commit:** `7453448`
**Packages:** server, reviewer-core, client, e2e (+ both `vendor/shared` copies) · **Size:** L (18 steps, S0–S17)
**Plan path (after approval):** `specs/plans/2026-10-08-intent-layer.md`

## Goal & scope
Before any review, a separate call to a cheap non-reasoning model works out what the PR is trying to do. It returns `{ summary, in_scope[], out_of_scope[], confidence, sources[], missing_context[] }`, which is stored per PR.

- **Intent card.** The PR page shows an Intent card above the review results. The card shows a stale marker when the PR changes, and **Re-detect intent** runs the classifier again.
- **Review agents.** Every agent gets the intent as an *unverified hypothesis*, and every finding is tagged `scope: in|out`.
- **Out-of-scope findings.** When the scope filter is on, they are dropped. Across all agents of one review execution, **exactly one** serious out-of-scope finding is kept as a signal.
- **Settings.** The existing "PR Review · Intent" picker defaults to `openrouter / openai/gpt-4.1-mini`, separate from the agents' models.

**Not in v1:** risk areas (removed entirely), Jira/Linear fetching, OpenRouter `require_parameters`, a kill-switch for auto-classification.

## Acceptance criteria
- **AC1.** The classifier sees the title, body, branch, commit messages, linked issues, fetched plans/specs, and changed files with **hunk headers only**. No hunk body line reaches the classifier. Proven by `reviewer-core/test/intent-prompt.test.ts` and `server/test/intent.it.test.ts` (inspects `MockLLMProvider.calls`).
- **AC2.** `POST /pulls/:id/intent` classifies with the `review_intent` feature model and upserts `pr_intent` with provider, model, prompt_version, tokens, cost, duration, head_sha and input_hash. `GET /pulls/:id/intent` returns `{intent:null}` before detection and the record after. Proven by `intent.it.test.ts`.
- **AC3.** The record turns `stale: true` with a `stale_reason` after the head SHA, title/body or prompt version changes. Proven by `intent-helpers.test.ts` and `intent.it.test.ts`.
- **AC4.** An empty body gives `confidence: 'low'`, and the input still contains the title, file names and hunk headers. Proven by `intent-prompt.test.ts`, `intent-helpers.test.ts` and `intent.it.test.ts`.
- **AC5.** Tickets and plan/spec links in the description are fetched and listed in `sources` with a status. Supported forms: closing keywords, `#N`, same-repo `owner/repo#N`, same-repo issue URLs, repo-relative `.md` paths, and same-repo `github.com/.../blob/...` URLs. An unreachable, unsupported or not-allowlisted ref goes into `missing_context` before the LLM call and is never invented; when one exists, confidence is capped at `medium`. Proven by `intent-helpers.test.ts`, `intent-sources.test.ts` and `intent.it.test.ts`.
- **AC6.** The reviewer prompt has `## PR intent (unverified hypothesis)` wrapped in `<untrusted source="pr-intent">`, plus a trusted scope rule. Without an intent, the prompt is byte-identical to today's. The trace stores the block in `prompt_assembly.intent`. Proven by `reviewer-core/test/prompt.test.ts` and `reviews-intent.it.test.ts`.
- **AC7. One out-of-scope signal per review execution.**
  - The filter is on only when the intent exists, is fresh, and has confidence ≠ low.
  - For each agent, reviewer-core drops every out-of-scope finding. It returns at most one eligible candidate (CRITICAL, or WARNING with category `security`).
  - After all agents of the execution settle, the executor picks one winner across agents. Ranking: severity → confidence → job order → file → start_line → title.
  - The winner is persisted with `scope='out'` in its agent's review, and that review's score and blockers are recomputed.
  - No other out-of-scope finding is persisted.
  - With the filter off, nothing is dropped and runs complete as today.
  - A single `reviewPullRequest` call (CI) yields at most one candidate.
  - Proven by `reviewer-core/test/scope.test.ts`, `run.test.ts` and `server/test/reviews-scope-signal.it.test.ts`.
- **AC8.** A review on a PR with no stored intent classifies once, before the agents. A classifier failure leaves the review `done` and logs "Intent unavailable". A stale intent is used, not re-classified, logged as stale, and leaves the filter off. Proven by `reviews-intent.it.test.ts`.
- **AC9.** The Intent card shows the quoted summary, In scope / Out of scope columns, a confidence badge, sources with status, a missing-context warning, a stale badge with a Re-detect button, and loading, empty and error states. It sits above the results on the Overview and Agent runs tabs. Findings with `scope='out'` show an "Outside PR scope" badge. Proven by `IntentCard.test.tsx`, `FindingCard.test.tsx` and `e2e/specs/08-pr-intent.flow.json`.
- **AC10.** Settings → "PR Review · Intent" defaults to `openrouter / openai/gpt-4.1-mini`. Proven by `server/test/feature-models.test.ts` and `client/src/lib/feature-models.test.ts`.
- **AC11.** Logs carry the model, prompt version, per-component char/token sizes, a token estimate and sources as `{kind, ref, status}`. They never carry the body, issue/doc text, hunk bodies, URL query strings or keys. Proven by `intent.it.test.ts` with a capturing logger.

## Context applied
| Source (file:line) | Rule or insight | Effect on this plan |
|---|---|---|
| `server/src/vendor/shared/contracts/brief.ts:9-14,116-121` | `Intent {intent,in_scope,out_of_scope}`, used in `PrBrief` | S1 renames to `summary` and extends; `PrBrief` follows |
| `server/src/vendor/shared/contracts/review-api.ts:61-63` | `PrIntentRecord = Intent + pr_id` | S1 extends it and adds `PrIntentResponse` |
| `server/test/contracts.test.ts:74` | Parses `Intent` with `intent:` | Consumer missing from the brief; S1 updates it |
| `server/src/modules/reviews/repository.ts:141-149`, `repository/pull.repo.ts:47-68` | Dead intent repository code, no callers | S1 deletes it; S3 re-creates it in `modules/intent/repository.ts` |
| `server/src/db/schema/reviews.ts:28-55`; last migration `0013_l03_conventions.sql` | `pr_intent` has 4 columns; `findings` has no scope | S3 generates migration `0014`; the SQL column `intent` is kept (decision 1) |
| `server/src/vendor/shared/contracts/findings.ts:11,47-62` | Severity is `CRITICAL\|WARNING\|SUGGESTION`; optional fields are `.nullish()` | `scope` is `.nullish()`; eligibility = CRITICAL or WARNING+security |
| `reviewer-core/src/llm/openrouter.ts:69-77` | Strict `json_schema`, no `require_parameters` | No length constraints in the LLM schema; output clamped server-side; `require_parameters` stays out of scope |
| `server/src/vendor/shared/contracts/platform.ts:52-58,73-81` + `server/INSIGHTS.md` 2026-09-30 (reasoning models) | `review_intent` = `openai/gpt-4.1`; conventions proven on `openai/gpt-4.1-mini` | S8 default `openrouter / openai/gpt-4.1-mini` |
| `client/src/lib/feature-models.ts:13-49`, `SettingsModels.tsx:30-33,56` | Client mirror without an equality test; picker always saves `openrouter`; hint = registry description | S8 mirrors the change and adds an equality test |
| `server/src/modules/settings/feature-models.ts:51-57`, `conventions/service.ts:114,149-160` | `resolveFeatureModel` → `container.llm().completeStructured` | Copied in S9 |
| `server/src/modules/reviews/run-executor.ts:105-119,150-349` | Diff step, then agents; `runOneAgent` computes **and** persists, completes the run, saves the trace and closes SSE in one method | S10 adds the intent step; S11 splits `runOneAgent` into compute and finalize |
| `run-executor.ts:47,61,72,160,316`; `platform/run-logger.ts:8,18` | Comments already describe an intent step | S10 makes them true |
| `server/INSIGHTS.md` 2026-10-07 (parallel agents; `shared` ids on fanned-out events) | p-queue concurrency; fanned-out events share an id | Intent step and finalize lines are logged through fan-out loggers |
| `server/INSIGHTS.md` "Repo-intel context degrades silently" | Optional prompt slots degrade | Intent is optional; a classifier failure degrades the review |
| `reviewer-core/src/prompt.ts:16-28,85-141` + `test/prompt.test.ts:26-31` | Guard already names "derived intent/scope" as untrusted | S5 adds the `intent` part and keeps the guard tests |
| `reviewer-core/src/review/run.ts:196-218`; `reviewer-core/INSIGHTS.md` (score recomputed via `scoreFromFindings`, `reduce.ts:20`) | Score comes from findings that survive grounding | Scope partition runs after grounding; `withScopeSignal` recomputes the score |
| `server/src/modules/reviews/service.ts:85-90`; `run-executor.ts:237-239` | `cancelRun` marks the DB row + bus; `runBus.isCancelled` | The finalize phase skips cancelled runs and excludes their candidates |
| `reviewer-core/AGENTS.md`, `server/AGENTS.md` Boundaries | Prompts and pure logic live in reviewer-core; exports are add-only | Classifier prompt, partition, pick and signal helpers go in reviewer-core |
| `server/src/vendor/shared/adapters.ts:143-167`; `adapters/github/octokit.ts:126-135,351-364` | No content-at-ref call; weak `#N` regex | S2 adds `getFileContent`; the intent module has its own parser |
| `INSIGHTS.md` 2026-09-29 (vendor drift) | `adapters.ts` already differs | S2 mirrors only the new hunk; the drift must not grow |
| `server/src/adapters/mocks.ts:91-107,235-237` | `structuredBySchema`; `getIssue` always succeeds | S2 adds issue/file maps and failure modes |
| `server/src/platform/config.ts:79` + `test/reviews.it.test.ts:112-124`, `reviews-skills.it.test.ts:98-106` | Tests read the real secrets file and inject only an `openai` mock | **Hermeticity hazard:** S10 injects `github` + `openrouter` mocks |
| `server/INSIGHTS.md` 2026-09-17 (run-all in tests) | Run-all of seeded agents is non-deterministic | S11 tests create two test agents with mocked providers and run each with explicit `agentId` jobs through the executor |
| `server/INSIGHTS.md` "Rate limits are layered", `reviews/routes.ts:27-29` | LLM routes need per-route caps | POST intent capped at 6/min |
| `server/src/modules/pulls/routes.ts:234-244` vs `:59,71` | Detail refresh updates the body; list sync updates `headSha` | Staleness = head SHA + title/body/version hash |
| `client/src/app/repos/[repoId]/pulls/[number]/page.tsx:150,155-184` | Results live in the Findings tab; Run switches to it | Card rendered above the tab content on both tabs |
| frontend-architecture skill (PR detail → `prReview`); `client/INSIGHTS.md` 2026-09-29 (type-only shared imports) | Namespace rule; client imports types only | Strings in `prReview.json`; `import type` only |
| `server/src/db/seed.ts:96-133` | PR #482, `headSha 'a1b2c3d4e5f6'`, no intent | S16 seeds a fresh intent idempotently |

## Constraints hit
- **Migrations.** Schema edit → `pnpm db:generate --name l03_intent_layer` → new `0014_*.sql`. The SQL column `intent` is kept, because drizzle-kit 0.30 asks an interactive question on rename.
- **`reviewer-core/src/index.ts`.** Exports are add-only.
- **`vendor/shared`.** Server copy first, client mirror in the same step, `diff` empty for every touched file. For `adapters.ts`, the step proves the drift did not grow.
- **Secrets.** GitHub and OpenRouter are reached only through `container.github()` / `container.llm()`. No new env vars or flags.
- **No new dependency.** Hashing uses `node:crypto`; token estimates use `container.tokenizer`.
- **No arbitrary URL fetch.** `UrlFetcher` is not used. Only the authenticated GitHub API is called, for the PR's own repo.

## Data sources
| Source (`kind`) | How obtained | Caps | Failure → status |
|---|---|---|---|
| `pr_title` | `pull_requests.title` | 300 chars | always ok |
| `pr_body` | `pull_requests.body` | 4 000 chars | empty → no source; drives confidence |
| `branch` | `pull_requests.branch` | 200 chars | — |
| `commits` | `pr_commits.message`, first line | 30 × 200 chars | none → omitted |
| `files` | `loadDiff()` (git diff, `pr_files.patch` fallback): path, +/−, and the `@@ … @@ <ctx>` header lines from `diff.raw` only | 200 files; 10 headers per file × 160 chars | empty diff → paths from `pr_files` |
| `issue` | From title + body: closing keywords (close/closes/closed/fix/fixes/fixed/resolve/resolves/resolved, optional colon), `#N`, `owner/repo#N`, `github.com/o/r/issues/N`. Same repo only. Fetched with `gh.getIssue`, 8 s timeout | 3 issues; body 4 000 chars | 404 `not_found`; 401/403 `forbidden`; timeout `timeout`; other repo `not_allowlisted`; no token or other error `unavailable` |
| `spec` / `plan` | Repo-relative `*.md` / `*.mdx` / `*.txt` paths and same-repo `github.com/o/r/blob/<ref>/<path>` URLs. Fetched with `gh.getFileContent(repo, path, headSha)`. `plan` if the path matches `/plan/i`, else `spec` | 3 docs; 12 000 chars each (`truncated: true`); > 1 MB → `too_large` | as for issues; directory or binary → `unsupported`; `..` or absolute → `not_allowlisted` |
| `link` (Jira/Linear keys, other hosts) | Detected, **not fetched** | 5 | `unsupported` (keys) / `not_allowlisted` (hosts) |

Refs are stored and logged sanitised: `#N`, a repo path, or `host/path` with no query string, fragment or userinfo. Every non-ok source becomes a `missing_context` line, and the prompt lists it under "Unavailable sources — do not guess their content".

## Call sequence
```mermaid
sequenceDiagram
  autonumber
  participant UI as Client IntentCard
  participant R as intent/routes.ts
  participant S as IntentService
  participant GH as GitHubClient port
  participant RC as reviewer-core intent
  participant LLM as LLMProvider (openrouter)
  participant DB as IntentRepository
  UI->>R: POST /pulls/:id/intent (rate 6/min)
  R->>S: detect(ws, prId, req.log)
  S->>DB: pull, repo, commits (404 if missing)
  S->>S: loadDiff → extractHunkHeaders (no bodies)
  S->>S: extractReferences(title, body, branch, repo)
  par ≤3 issues, ≤3 docs, 8 s each
    S->>GH: getIssue(repo, N)
    S->>GH: getFileContent(repo, path, headSha)
  end
  S->>S: statuses → sources[], missing_context[]
  S->>RC: buildIntentMessages → messages + component sizes
  S->>S: log {model, promptVersion, components, tokenEstimate, sources}
  S->>LLM: completeStructured(IntentClassification, temp 0, 1200 tok, 30 s)
  LLM-->>S: data, tokens, cost
  S->>S: clamp; confidence = min(computed, model)
  S->>DB: upsert pr_intent + metadata
  R-->>UI: { intent } (stale=false)
```
```mermaid
sequenceDiagram
  autonumber
  participant EX as RunExecutor.executeRuns
  participant IS as IntentService.forReview
  participant Q as p-queue (agents)
  participant EN as reviewer-core
  participant DB as ReviewRepository
  participant BUS as RunBus (SSE)
  EX->>EX: step "Loading PR diff" (failAll on error)
  EX->>IS: step "Loading PR intent" (fan-out log)
  IS-->>EX: intent + scopeFilter (fresh & conf≠low), or throw → no intent, filter off
  alt scopeFilter off
    Q->>EN: reviewPullRequest per agent
    Q->>DB: finalize immediately (persist, complete run, trace)
    Q->>BUS: complete(runId), as today
  else scopeFilter on (two-phase)
    par Phase 1, per agent
      Q->>EN: reviewPullRequest({intent, scopeFilter: true})
      EN-->>Q: review (in-scope only) + scopeCandidate (≤1) + scopeDropped
      Q->>BUS: log partition; "waiting for N other agent(s)"
      Note over Q: compute failure → persist failed run now (no candidate)
    end
    EX->>EX: drop cancelled runs; pickScopeSignal(candidates in job order)
    EX->>BUS: fan-out "Out-of-scope signal: kept … from agent X; K dropped"
    loop Phase 2, finalize in job order
      EX->>EN: withScopeSignal(review, winner?) → findings + score
      EX->>DB: insertReview, insertFindings, markReviewed, completeAgentRun(done), saveRunTrace
      EX->>BUS: complete(runId)
      Note over EX: finalize failure → that run failed; if it held the signal, re-pick from the rest
    end
  end
```

## Contract & data changes
| Contract / table | Before → after | Optional/nullable choice | Consumers to update |
|---|---|---|---|
| `Intent` (`brief.ts`) | `{intent,in_scope,out_of_scope}` → `{summary, in_scope, out_of_scope, confidence, sources: IntentSource[], missing_context: string[]}` | required | `PrBrief` (automatic), `contracts.test.ts:74`, `pull.repo.ts` (deleted) |
| new `IntentConfidence` | `low\|medium\|high` | — | engine, service, client |
| new `IntentSourceKind`, `IntentSourceStatus`, `IntentSource` | `{kind: pr_title\|pr_body\|branch\|commits\|files\|issue\|spec\|plan\|link, ref, status: ok\|not_found\|forbidden\|timeout\|not_allowlisted\|too_large\|unsupported\|unavailable, truncated?}` | `truncated` nullish | service, client |
| new `IntentClassification` (LLM output) | `{summary, in_scope, out_of_scope, confidence, missing_context}` | all required (strict), no `.max()` | reviewer-core test, service |
| `PrIntentRecord` (`review-api.ts`) | + `head_sha, provider, model, prompt_version` (nullable string), `tokens_in, tokens_out, duration_ms` (nullable int), `cost_usd` (nullable), `detected_at`, `stale` (boolean), `stale_reason` (`head_moved\|description_changed\|prompt_updated`, nullable) | `.nullable()` (DB-row DTO) | routes, client hook |
| new `PrIntentResponse` | `{intent: PrIntentRecord.nullable()}` | — | routes, client hook |
| `Finding` (`findings.ts`) | + `scope: z.enum(['in','out']).nullish()` | nullish (strict schema + old rows) | reviewer-core, `review.repo.ts:38-51`, `reviews/helpers.ts:36-55`, FindingCard |
| `PromptAssembly` (`trace.ts`) | + `intent: z.string().nullish()` | nullish (jsonb) | `assemblePrompt` |
| `FEATURE_MODELS.review_intent` | `openai/gpt-4.1` → `openrouter / openai/gpt-4.1-mini`; description "…Use a cheap, non-reasoning model." | — | `client/src/lib/feature-models.ts` |
| `GitHubClient` port | + `getFileContent(repo, path, ref): Promise<{path, content, size}>`; errors carry `.status` | — | octokit adapter, `MockGitHubClient` |
| table `pr_intent` | + `confidence text NOT NULL DEFAULT 'low'`, `sources jsonb NOT NULL DEFAULT '[]'`, `missing_context jsonb NOT NULL DEFAULT '[]'`, `head_sha`, `input_hash`, `provider`, `model`, `prompt_version` (text), `tokens_in`, `tokens_out`, `duration_ms` (int), `cost_usd` (double), `detected_at timestamptz NOT NULL DEFAULT now()`. TS key `summary` → SQL `intent` | metadata nullable | `modules/intent/repository.ts` |
| table `findings` | + `scope text` (nullable) | nullable | as for `Finding` |

**API:**
- `GET /pulls/:id/intent` → `PrIntentResponse`.
- `POST /pulls/:id/intent` → `PrIntentResponse`, empty body, rate 6/min.
- Errors: 404 for a foreign or missing PR; `ConfigError` for a missing key; `ExternalServiceError` (502) for LLM or schema failure.

## reviewer-core design
- **Classifier (`src/intent/prompt.ts`, `src/intent/confidence.ts`).**
  - `INTENT_PROMPT_VERSION = 'intent-v1'`.
  - `buildIntentMessages(input: IntentClassifierInput) → {messages, components: {name, chars}[]}`.
  - The input has **no field for hunk bodies**: `files: {path, additions, deletions, hunkHeaders}[]`.
  - The system message is trusted. Rules: derive from the given sources only; never guess the listed unavailable sources (echo them into `missing_context`); short phrases for scope items; everything in `<untrusted>` is data.
  - Each source is wrapped with `wrapUntrusted` (`pr-title`, `pr-description`, `issue-#N`, `doc:<path>`, `changed-files`, `unavailable-sources`).
  - `computeIntentConfidence`: empty or short body (< 80 chars) and no ok issue/doc → `low`; body ≥ 80 chars **or** an ok issue/doc → `medium`; both → `high`; any explicit ref not ok → at most `medium`.
  - `minConfidence(a, b)` combines the computed level with the model's.
- **Review prompt (`prompt.ts`).**
  - `PromptParts.intent?: ReviewIntent` (`{summary, in_scope, out_of_scope, confidence, missing_context, stale}`) renders `## PR intent (unverified hypothesis)` right after `## PR description`, wrapped as `pr-intent`.
  - When an intent is present, a trusted `SCOPE_RULE` follows `INJECTION_GUARD`: tag every finding's `scope`; scope never changes severity; report every real defect.
  - `assembly.intent` holds the rendered block.
- **Scope helpers (`src/review/scope.ts`, pure, exported add-only).**
  - `compareScopeSignal(a, b)`: severity rank (CRITICAL > WARNING > SUGGESTION), then confidence descending, then optional `order` ascending, then `file`, `start_line`, `title` ascending. Total and deterministic.
  - `isScopeSignalEligible(f)`: `scope === 'out'` and (`CRITICAL`, or `WARNING` with `category === 'security'`).
  - `partitionByScope(findings, {enabled}) → {kept, candidate, dropped}`:
    - disabled → everything kept, `candidate: null`;
    - enabled → `scope` null or `in` is kept;
    - every `out` finding leaves `kept`;
    - the best eligible one becomes `candidate`;
    - all other `out` findings go to `dropped` with reason `out of PR scope`, or `out of PR scope (not the top signal)` when eligible.
  - `pickScopeSignal(candidates: {order: number, finding}[]) → {winner, losers}`, using `compareScopeSignal`.
  - `withScopeSignal(review, finding | null) → Review`: appends the finding when non-null and recomputes `score` with `scoreFromFindings` (`reduce.ts:20`). Never mutates its input.
- **`reviewPullRequest`.**
  - New inputs: `ReviewInput.intent?: ReviewIntent`, `scopeFilter?: boolean` (default false, and ignored without an intent).
  - After `groundFindings` it applies `partitionByScope`. `review.findings` is the in-scope set and its score is computed from that set.
  - New outputs: `ReviewOutcome.scopeCandidate: Finding | null` and `scopeDropped`.
  - Events: one per dropped finding, plus `Scope filter: kept N in-scope, dropped M out-of-scope, candidate "…"|none`.
- **CI-runner semantics.** One call is one agent. The caller applies `withScopeSignal(outcome.review, outcome.scopeCandidate)`, so it gets at most one signal. Multi-agent callers use `pickScopeSignal`.

## Server design
- **Module `src/modules/intent/`.**
  - `routes.ts` (copy `modules/agents`).
  - `service.ts` (`IntentService`: `get`, `detect`, `forReview`).
  - `source-resolver.ts` (GitHub port, `withTimeout`, `Promise.allSettled`, status mapping by `err.status`).
  - `repository.ts`.
  - `helpers.ts`, pure: `extractReferences`, `extractHunkHeaders`, `sanitizeRef`, `intentInputHash`, `deriveStaleness`, `clampClassification` (summary ≤ 600 chars; ≤ 8 items per list, each ≤ 200 chars; ≤ 10 missing items), `toIntentRecordDto`.
  - `constants.ts`.
- **Executor (`run-executor.ts`).**
  - Intent step: `IntentService.forReview` returns `{intent, scopeFilter}`. `scopeFilter = !stale && confidence !== 'low'`. Any error degrades with an info line, never `failAll`.
  - `runOneAgent` is split into:
    - `computeAgent` (LLM + engine; returns an in-memory `AgentComputation`, nothing persisted);
    - `finalizeAgent(comp, signal | null)` (`withScopeSignal`, then `insertReview`, `insertFindings` with scope, `markReviewed`, `countBlockers`, `completeAgentRun('done')`, `saveRunTrace` from the buffer, `runBus.complete`);
    - `failAgent` (the current catch block).
  - **Filter off:** each queue task runs compute then finalize, which is today's behaviour.
  - **Filter on:**
    - Phase 1: queue tasks only compute. A compute failure goes through `failAgent` immediately and adds no candidate.
    - Each successful run logs `Waiting for other agent(s) to choose this PR's out-of-scope signal…`.
    - Pick: after `runAgentsConcurrently` settles, the executor drops runs where `runBus.isCancelled(runId)` (the user cancelled during the wait; `cancelRun` already marked them). It then calls `pickScopeSignal` with `order` = index in `jobs`, so completion order never matters.
    - It logs one fan-out line to all surviving runs: `Out-of-scope signal: kept "<title>" (<severity> <category>, conf <c>) from agent "<name>"; dropped K other candidate(s)`, or `none`.
    - Phase 2: finalize runs sequentially in job order; the winner's agent gets the signal.
    - If the winner's finalize throws, that run is failed and the executor re-picks from the remaining candidates whose runs are not yet finalized. If none remain, it logs `signal lost`.
    - Before each finalize it re-checks `isCancelled`; a cancelled run is skipped. A millisecond-level race remains, the same as today.
- **Score, review row and trace.** Nothing is written before the winner is known, so no row is updated after insert.
  - The winner's review row stores the score from `withScopeSignal`.
  - `agent_runs.findingsCount`, `score` and `blockers` (`countBlockers` over the final set) include the signal.
  - `trace.stats.findings` counts the persisted set; `trace.log` (the buffer) contains the partition, waiting and decision lines; `raw_output` is unchanged.
  - `costUsd` and tokens are per agent as today; intent cost lives only on `pr_intent`.
- **Run status and SSE timing.**
  - With the filter on, every run of the execution stays `running` until all agents settle, and all reach `done` within the finalize loop.
  - The client already polls active runs and refetches reviews when each SSE stream closes (`page.tsx:178-182`), so it shows the final data, signal included.
  - A rejected alternative: finishing runs early and patching the winner afterwards. It would report `done` runs that change later and would race the client's refetch.

## Logging and observability
- **Pino, `intent: classifying`:** `{prId, provider, model, promptVersion, components: [{name, chars, tokens}], tokenEstimate, sources: [{kind, ref, status}]}`.
- **Pino, `intent: done`:** `{prId, tokensIn, tokensOut, costUsd, durationMs, confidence, missingContext: n}`.
- **Review runs:** the same lines go to the fan-out `runLog` with safe data only, because `RunLogger` mirrors `data` to pino (`run-logger.ts:55`).
- **Scope decision:** logged per run (partition) and fanned out (winner).

## Security
- **SSRF.** Only the authenticated GitHub API is called, for the PR's own repo; other hosts are recorded and never fetched.
- **Path abuse.** Paths with `..`, absolute paths and schemes are rejected.
- **Prompt injection.**
  - Every source and the intent itself are wrapped untrusted; `INJECTION_GUARD` is unchanged; `SCOPE_RULE` is trusted text.
  - The output is clamped and zod-validated, and the card renders plain text (no Markdown).
- **Scope gaming.**
  - Severity never changes with scope.
  - The filter is off for stale or low-confidence intents.
  - An eligible serious signal always survives per execution.
  - Every drop is logged in the run trace.
- **Data exposure.**
  - No hunk bodies go to the classifier.
  - Logs hold sizes, refs and statuses only; query strings and userinfo are stripped.
  - Private-repo issue/spec text goes to the configured LLM provider, as diffs already do.
- **Cost / DoS.** Caps and timeouts on sources, 6/min on POST, and at most one classifier call per review when none is stored.

## Steps

### S0 — Spec  [package: — · layer: docs]
- **Skills:** engineering-insights; fact check
- **Files:** create `specs/L03-intent-layer.md` (template from `specs/README.md`): Goal, Scope, Contracts, Per-package work, AC1–AC11, the Decisions table.
- **Test first:** no test: docs only.
- **Verify:** cited paths exist; links resolve.
- **Depends on:** — · **Done when:** spec approved.

### S1 — Shared contracts  [package: server + client mirror · layer: contracts]
- **Skills:** shared-contracts, zod, onion-architecture, fastify-best-practices, frontend-architecture, react-best-practices, next-best-practices, test-strategy, engineering-insights
- **Files:**
  - modify `server/src/vendor/shared/contracts/brief.ts:8-14`, `review-api.ts:61-63`, `findings.ts:47-62`, `trace.ts:56-73`;
  - mirror all four to `client/src/vendor/shared/contracts/`;
  - delete the dead intent code in `server/src/modules/reviews/repository.ts:3,141-149` and `repository/pull.repo.ts:4,47-68`;
  - modify `server/test/contracts.test.ts:72-76`.
- **Test first:** `contracts.test.ts`, cases:
  - the new `Intent` sample parses; the old `{intent:'x',…}` throws;
  - `status:'maybe'` throws;
  - `Finding` parses with and without `scope` and rejects `'both'`;
  - `PromptAssembly` parses without `intent`.
- **Verify:** `cd server && pnpm exec vitest run test/contracts.test.ts && pnpm typecheck` · `cd client && pnpm typecheck` · `cd reviewer-core && npm run typecheck` · `diff` of the four files prints nothing.
- **Depends on:** — · **Done when:** contracts for AC1–AC7; all packages type-check.

### S2 — GitHub port `getFileContent` + mock failure modes  [package: server (+ port mirror) · layer: repository/edge]
- **Skills:** onion-architecture, fastify-best-practices, shared-contracts, zod, security, frontend-architecture, react-best-practices, next-best-practices, test-strategy, engineering-insights
- **Files:**
  - modify `server/src/vendor/shared/adapters.ts:143-167`; mirror only that hunk into `client/src/vendor/shared/adapters.ts`;
  - modify `server/src/adapters/github/octokit.ts` (after `:364`): `repos.getContent`; an array result throws `{status: 415}`; > 1 MB throws `{status: 413}`; decode base64;
  - modify `server/src/adapters/mocks.ts:124-130,235-237`: `issues?`, `files?` maps (value or `{status}`), `issueCalls`, `fileCalls`;
  - modify `server/test/adapters.test.ts`.
- **Test first:**
  - `getFileContent` returns the mapped content and records `ref`;
  - a missing path rejects with `status 404`;
  - `issues:{7:{status:403}}` rejects with 403;
  - without an `issues` option the old default still works.
- **Verify:** `cd server && pnpm exec vitest run test/adapters.test.ts && pnpm typecheck` · `cd client && pnpm typecheck` · `diff server/src/vendor/shared/adapters.ts client/src/vendor/shared/adapters.ts | wc -l` is no larger than before.
- **Depends on:** S1 · **Done when:** port ready for AC5.

### S3 — DB: `pr_intent` columns, `findings.scope`, IntentRepository  [package: server · layer: db + repository]
- **Skills:** db-schema-change, drizzle-orm-patterns, postgresql-table-design, onion-architecture, fastify-best-practices, test-strategy, engineering-insights
- **Files:**
  - modify `server/src/db/schema/reviews.ts:28-55`;
  - generated `server/src/db/migrations/0014_l03_intent_layer.sql` + `meta/`;
  - create `server/src/modules/intent/repository.ts` (`get`, `upsert` copying `pull.repo.ts:49-62`, `commitMessages`);
  - create `server/test/intent-repository.it.test.ts`.
- **Test first:**
  - `get` on an unknown PR → undefined;
  - upsert then get round-trips summary, sources and metadata;
  - a second upsert overwrites and leaves one row;
  - a finding inserted with `scope:'out'` reads back `'out'`.
- **Implement:** run `pnpm db:generate --name l03_intent_layer`, check the SQL has only `ADD COLUMN` statements (no DROP or RENAME), then `pnpm db:migrate`.
- **Verify:** `cd server && pnpm typecheck && TEST_DATABASE_URL=postgres://devdigest:devdigest@localhost:5432/devdigest_it pnpm exec vitest run test/intent-repository.it.test.ts`
- **Depends on:** S1 · **Done when:** storage for AC2/AC3/AC7.

### S4 — reviewer-core classifier prompt + confidence  [package: reviewer-core · layer: reviewer-core]
- **Skills:** typescript-expert, security, test-strategy, engineering-insights
- **Files:** create `reviewer-core/src/intent/prompt.ts`, `reviewer-core/src/intent/confidence.ts`, `reviewer-core/test/intent-prompt.test.ts`; modify `reviewer-core/src/index.ts:59` (add-only).
- **Test first:**
  - each source sits in its own untrusted block; `</untrusted>` is escaped;
  - the files section has `@@ … @@ fn` headers and no `+`/`-`/context lines;
  - an empty body renders `(empty)`, and the title, files and headers are kept;
  - unavailable refs are listed under "do not guess", and the system message has the rule;
  - caps hold;
  - component sizes sum to the user message;
  - confidence matrix: empty → low; long body → medium; long body + ok issue → high; ok issue + missing doc → medium; `minConfidence('high','low')` → low.
- **Verify:** `cd reviewer-core && npm run typecheck && npm test` · `cd server && pnpm typecheck`
- **Depends on:** S1 · **Done when:** AC1 and AC4 at the engine level.

### S5 — reviewer-core intent slot + scope partition + signal helpers  [package: reviewer-core · layer: reviewer-core]
- **Skills:** typescript-expert, security, test-strategy, engineering-insights
- **Files:**
  - modify `reviewer-core/src/prompt.ts:39-141`;
  - create `reviewer-core/src/review/scope.ts`;
  - modify `reviewer-core/src/review/run.ts:44-113,130-139,196-218`;
  - modify `reviewer-core/src/index.ts` (add `partitionByScope`, `pickScopeSignal`, `withScopeSignal`, `compareScopeSignal`, `isScopeSignalEligible`, type `ReviewIntent`);
  - tests: modify `test/prompt.test.ts`, create `test/scope.test.ts`, modify `test/run.test.ts`.
- **Test first:**
  - `prompt.test.ts`:
    - the intent block follows `## PR description`, wrapped as `pr-intent`, with confidence and missing context;
    - `SCOPE_RULE` and the guard (`:26-31`) are both present;
    - without intent, `user` equals the old output and `assembly.intent === null`.
  - `scope.test.ts`:
    - disabled → everything kept, `candidate: null`;
    - `in`/null kept;
    - out CRITICAL 0.9, out CRITICAL 0.6 and out WARNING bug → the CRITICAL 0.9 is the candidate and the other two are dropped with reasons;
    - an out WARNING security finding is a candidate when no CRITICAL exists;
    - out SUGGESTIONs only → no candidate;
    - `pickScopeSignal` resolves ties by confidence, then `order`, then file/line/title, and does not depend on input order;
    - `withScopeSignal` appends and recomputes the score without mutating its input, and a null signal leaves the review unchanged.
  - `run.test.ts`:
    - with `scopeFilter: true`, an out WARNING bug is absent from `review.findings`, the score is computed from in-scope findings only, and the drop event is emitted;
    - an out CRITICAL is returned as `scopeCandidate`, not inside `review.findings`;
    - `scopeFilter: false` → unchanged output.
- **Verify:** `cd reviewer-core && npm run typecheck && npm test` · `cd server && pnpm typecheck`
- **Depends on:** S1, S4 · **Done when:** AC6 and the engine half of AC7 (including the CI rule of at most one candidate).

### S6 — Intent pure helpers  [package: server · layer: service (domain helpers)]
- **Skills:** onion-architecture, fastify-best-practices, security, test-strategy, engineering-insights
- **Files:** create `server/src/modules/intent/helpers.ts`, `server/src/modules/intent/constants.ts`, `server/test/intent-helpers.test.ts`.
- **Test first:**
  - `extractReferences`:
    - `Fixes: #471`, same-repo `owner/repo#12` and issue URLs → issues;
    - `other/repo#3` → `not_allowlisted`;
    - `specs/L01-run-cost.md` → spec; a same-repo blob `…/docs/plan.md` → plan;
    - `../x.md` and `/etc/x.md` → `not_allowlisted`;
    - `PROJ-123` → `unsupported`;
    - a Linear URL with `?token=` → `not_allowlisted` with the ref stripped to `linear.app/x/issue/ABC-1`;
    - at most 3 issues and 3 docs, de-duplicated.
  - `extractHunkHeaders` returns `@@` lines only, truncated, at most 10 per file.
  - `intentInputHash` is stable and changes with title, body or version.
  - `deriveStaleness` returns each of the three reasons.
  - `clampClassification` enforces the caps.
- **Verify:** `cd server && pnpm exec vitest run test/intent-helpers.test.ts && pnpm typecheck`
- **Depends on:** S1 · **Done when:** parsing and staleness logic for AC3–AC5.

### S7 — Source resolver  [package: server · layer: service]
- **Skills:** onion-architecture, fastify-best-practices, security, test-strategy, engineering-insights
- **Files:** create `server/src/modules/intent/source-resolver.ts`, `server/test/intent-sources.test.ts`.
- **Test first (hermetic, `MockGitHubClient`):**
  - an ok issue → `#471 ok` with text;
  - a doc 404 → `not_found` plus a missing line and no text;
  - 403 → `forbidden`;
  - a never-resolving getter → `timeout` (fake timers);
  - an oversize doc → truncated, `truncated: true`;
  - `github()` throws `ConfigError` → every explicit ref is `unavailable` and nothing throws;
  - docs are fetched at `headSha`.
- **Verify:** `cd server && pnpm exec vitest run test/intent-sources.test.ts && pnpm typecheck`
- **Depends on:** S2, S6 · **Done when:** AC5 at the resolver level.

### S8 — Feature-model default  [package: server + client · layer: contracts]
- **Skills:** shared-contracts, zod, frontend-architecture, react-best-practices, next-best-practices, react-testing-library, test-strategy, engineering-insights
- **Files:** modify `server/src/vendor/shared/contracts/platform.ts:52-58` + mirror; modify `client/src/lib/feature-models.ts:21-27`; create `server/test/feature-models.test.ts`, `client/src/lib/feature-models.test.ts`.
- **Test first:**
  - `defaultFeatureModel('review_intent')` → `{provider:'openrouter', model:'openai/gpt-4.1-mini'}`;
  - the client registry deep-equals the shared one (value import allowed in vitest).
- **Verify:** `cd server && pnpm exec vitest run test/feature-models.test.ts && pnpm typecheck` · `cd client && pnpm exec vitest run src/lib/feature-models.test.ts && pnpm typecheck` · `diff` of `platform.ts` prints nothing.
- **Depends on:** S1 · **Done when:** AC10.

### S9 — IntentService + routes + registration  [package: server · layer: service + route]
- **Skills:** onion-architecture, fastify-best-practices, security, zod, db-schema-change, test-strategy, engineering-insights
- **Files:** create `server/src/modules/intent/service.ts`, `server/src/modules/intent/routes.ts`; modify `server/src/modules/index.ts:1-11,28-39`; create `server/test/intent.it.test.ts`.
- **Test first** (`github: MockGitHubClient({issues:{471:…}})`, `llm.openrouter: MockLLMProvider('openai',{structuredBySchema:{IntentClassification:…}})`):
  - GET → `{intent:null}`.
  - POST → record with `provider:'openrouter'`, `model:'openai/gpt-4.1-mini'`, `prompt_version:'intent-v1'`, `tokens_in:100`, `cost_usd:0.001`, and source `#471 ok`.
  - The classifier messages contain the hunk header and not `stripeKey` (AC1).
  - A `specs/missing.md` link → one missing item and confidence ≤ medium.
  - An empty body → `low`.
  - After `head_sha` changes, GET → `stale:true, stale_reason:'head_moved'`.
  - Unknown PR → 404.
  - A capturing logger sees `components` and `sources` and never the body or issue text.
- **Implement:**
  - routes copy `modules/agents/routes.ts` (`getContext`, `IdParams`, `response: {200: PrIntentResponse}`, POST `rateLimit {max:6,timeWindow:'1 minute'}`, pass `req.log`);
  - the service copies `conventions/service.ts:114,149-160` (`temperature 0`, `maxTokens 1200`, `timeoutMs 30000`, `maxRetries 1`, `sessionId <owner>/<name>#<n>:intent`) and uses `loadDiff` (`reviews/diff-loader.ts:12`);
  - LLM errors become `ExternalServiceError`; `ConfigError` passes through.
- **Verify:** `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts' && TEST_DATABASE_URL=… pnpm exec vitest run test/intent.it.test.ts`
- **Depends on:** S3, S4, S7, S8 · **Done when:** AC1–AC5, AC11.

### S10 — Review run loads/classifies intent and injects it (filter still off)  [package: server · layer: service]
- **Skills:** onion-architecture, fastify-best-practices, db-schema-change, security, test-strategy, engineering-insights
- **Files:**
  - modify `server/src/modules/reviews/run-executor.ts:105-119,216-240` (intent step; pass `intent`, `scopeFilter: false`) and comments `:47,61,72,160,316`;
  - modify `server/src/modules/intent/service.ts` (`forReview`);
  - modify `server/src/modules/reviews/repository/review.repo.ts:38-51` and `reviews/helpers.ts:36-55` (`scope`);
  - harness mocks in `server/test/reviews.it.test.ts:112-124`, `reviews-skills.it.test.ts:98-106`, `skills-injection.it.test.ts:60-67`: add `github: new MockGitHubClient()` and `llm.openrouter`;
  - create `server/test/reviews-intent.it.test.ts`.
- **Test first (single-agent runs):**
  - (a) No stored intent → one `pr_intent` row; the classifier was called once; `trace.prompt_assembly.intent` contains the summary; the log contains `Loading PR intent`.
  - (b) A stored fresh intent → the classifier is not called.
  - (c) A stale intent → injected, logged stale, no re-classify.
  - (d) The classifier throws → run `done`, the log contains `Intent unavailable`.
  - (e) The run's `cost_usd` excludes the classifier.
  - The three existing suites stay green.
- **Verify:** `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'` · `TEST_DATABASE_URL=… pnpm exec vitest run test/reviews-intent.it.test.ts` and then the three existing `.it` files, each on a fresh DB.
- **Depends on:** S5, S9 · **Done when:** AC6 end to end, AC8.

### S11 — One out-of-scope signal per review execution (two-phase executor)  [package: server · layer: service]
- **Skills:** onion-architecture, fastify-best-practices, db-schema-change, security, test-strategy, engineering-insights
- **Files:**
  - modify `server/src/modules/reviews/run-executor.ts:119-349`: split into `computeAgent` / `finalizeAgent` / `failAgent`; two-phase path when `scopeFilter`; pick, re-pick and cancel handling;
  - create `server/src/modules/reviews/scope-signal.ts` (small pure adapter from `AgentComputation[]` to `pickScopeSignal` input, plus the log-line builders);
  - create `server/test/reviews-scope-signal.test.ts` (hermetic) and `server/test/reviews-scope-signal.it.test.ts`.
- **Test first:**
  - `reviews-scope-signal.test.ts`: candidates from 3 computations (CRITICAL 0.8 at order 2, CRITICAL 0.8 at order 0, WARNING security at order 1) → the order-0 CRITICAL wins regardless of array order; no candidates → `none`; log lines carry no body text.
  - `reviews-scope-signal.it.test.ts`: two test agents with explicit jobs and per-provider mocks (agent A on `openai`, agent B on `anthropic`, each with its own `MockLLMProvider` fixture), plus a stored fresh `medium` intent.
    - (a) A returns an out CRITICAL; B returns an out CRITICAL with higher confidence plus an out WARNING bug. Exactly one `scope='out'` finding is persisted across the PR (B's). B's review score and `agent_runs.blockers` include it; A's do not. Both runs are `done`. Both traces log the decision line.
    - (b) Neither agent has an eligible candidate → zero out-of-scope findings and both runs `done`.
    - (c) Agent B's compute fails → B `failed`; A's candidate is persisted; A is `done`.
    - (d) A stale intent → filter off and both agents' out findings persisted with scope (no partition).
    - (e) While agent A waits (its LLM resolves at once, B's mock is delayed), A's run is still `running` in `agent_runs`.
- **Implement:**
  - Job order is the index in `jobs`.
  - Phase 2 is sequential in job order.
  - Finalize writes nothing before the winner is chosen.
  - A finalize error on the winner re-picks from the runs not yet finalized.
  - Each run is checked with `runBus.isCancelled` before pick and before persist.
  - With the filter off, the code path is identical to S10 (compute then finalize inside the queue task).
- **Verify:** `cd server && pnpm typecheck && pnpm exec vitest run test/reviews-scope-signal.test.ts && pnpm exec vitest run --exclude '**/*.it.test.ts'` · `TEST_DATABASE_URL=… pnpm exec vitest run test/reviews-scope-signal.it.test.ts`; re-run `reviews.it`, `reviews-intent.it`, `reviews-concurrency.test.ts`.
- **Depends on:** S10 · **Done when:** AC7 end to end.

### S12 — Client hooks  [package: client · layer: hook]
- **Skills:** frontend-architecture, react-best-practices, next-best-practices, react-testing-library, test-strategy, engineering-insights
- **Files:** create `client/src/lib/hooks/intent.ts`, `client/src/lib/hooks/intent.test.ts`; modify `client/src/lib/hooks/index.ts:10`.
- **Test first** (`vi.mock("../api")`, `renderHook` + a fresh `QueryClientProvider`):
  - a null prId does not fetch;
  - GET `/pulls/p1/intent`;
  - `useDetectIntent` POSTs and writes `["pr-intent","p1"]`.
- **Implement:** `import type` only; no custom toast (`client/INSIGHTS.md` "Mutation errors are already toasted globally").
- **Verify:** `cd client && pnpm exec vitest run src/lib/hooks/intent.test.ts && pnpm typecheck`
- **Depends on:** S1 · **Done when:** data access for AC9.

### S13 — IntentCard + i18n  [package: client · layer: component]
- **Skills:** frontend-architecture, react-best-practices, next-best-practices, react-testing-library, test-strategy, engineering-insights
- **Files:** create `client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard/{IntentCard.tsx,index.ts,styles.ts,helpers.ts,IntentCard.test.tsx}`; modify `client/messages/en/prReview.json` (`intent.*`: title, inScope, outOfScope, confidence.*, sources, sourceStatus.*, missingContext, stale.*, redetect, detect, detecting, empty, error, lowConfidenceHint).
- **Test first** (`vi.mock("@/lib/hooks/intent")`, intl provider with `prReview.json`):
  - loading → skeleton;
  - null → empty state, and "Detect intent" calls `mutate`;
  - a record → quoted summary, both columns, "Low confidence" badge, sources with statuses, missing-context warning;
  - stale → badge, and "Re-detect intent" calls `mutate`;
  - pending → button disabled;
  - error → `ErrorState` with retry.
- **Implement:** use `@devdigest/ui` `Card`, `Badge`, `Chip`, `Button`, `Skeleton`, `ErrorState`, `SectionLabel`; plain text only.
- **Verify:** `cd client && pnpm exec vitest run "src/app/repos/[repoId]/pulls/[number]/_components/IntentCard" && pnpm typecheck`
- **Depends on:** S12 · **Done when:** AC9 at the component level.

### S14 — FindingCard "Outside PR scope" badge  [package: client · layer: component]
- **Skills:** frontend-architecture, react-best-practices, next-best-practices, react-testing-library, test-strategy, engineering-insights
- **Files:** modify `.../_components/FindingCard/FindingCard.tsx`, `FindingCard.test.tsx`; `client/messages/en/prReview.json` (`finding.outOfScope`).
- **Test first:** `scope='out'` → badge visible; null or `in` → no badge.
- **Verify:** `cd client && pnpm exec vitest run "src/app/repos/[repoId]/pulls/[number]/_components/FindingCard" && pnpm typecheck`
- **Depends on:** S1 · **Done when:** the AC7 signal is visible to the user.

### S15 — Wire the card into the PR page  [package: client · layer: page]
- **Skills:** frontend-architecture, react-best-practices, next-best-practices, e2e-flows, engineering-insights
- **Files:** modify `client/src/app/repos/[repoId]/pulls/[number]/page.tsx:154-184`.
  - Render `<IntentCard prId={prId} />` above the tab content for `overview` and `findings`.
  - In `onRunDone` (`:178-182`), also invalidate `["pr-intent", prId]`.
- **Test first:** no unit test (the page has no colocated test); covered by S16 e2e and S13.
- **Verify:** `cd client && pnpm typecheck && pnpm test` (+ `pnpm build` with dev stopped, or "not run: dev server running").
- **Depends on:** S13 · **Done when:** AC9 placement.

### S16 — Seed + e2e flow 08  [package: server (seed) + e2e · layer: e2e]
- **Skills:** db-schema-change, drizzle-orm-patterns, e2e-flows, test-strategy, engineering-insights
- **Files:**
  - modify `server/src/db/seed.ts` (after the PR #482 block, around `:133`): idempotent `insert(prIntent).onConflictDoNothing()` with a fresh `medium` intent (`head_sha` = seeded head, `input_hash` from `intentInputHash`);
  - create `e2e/specs/08-pr-intent.flow.json`.
- **Test first (the flow):**
  - open `{BASE}/`, wait `/pulls`, click the PR row, wait `/pulls/482` and `networkidle`;
  - `wait --text` for the summary, "In scope", "Out of scope", "Medium confidence";
  - click "Agent runs", wait `tab=findings`, wait for the summary again;
  - no Re-detect click.
- **Verify:** `cd server && pnpm typecheck && pnpm db:seed` · `cd e2e && npm run typecheck && npm run e2e:hermetic` (or "not run: <reason>").
- **Depends on:** S3, S6, S15 · **Done when:** AC9 end to end.

### S17 — Docs + insights  [package: — · layer: docs]
- **Skills:** engineering-insights; fact check
- **Files:**
  - `server/README.md` (API map: intent routes; two-phase completion when the scope filter is on);
  - `reviewer-core/README.md:31-35` (intent slot, scope helpers, CI usage of `withScopeSignal`);
  - `docs/agent-prompts/README.md` (intent block, `SCOPE_RULE`);
  - insights:
    - `server/INSIGHTS.md` [Pitfall]: tests read the real secrets file, so every new review-path LLM/GitHub call needs harness mocks (`config.ts:79`);
    - `server/INSIGHTS.md` [Pitfall]: a column rename makes `drizzle-kit generate` interactive;
    - `server/INSIGHTS.md` [Architectural decision]: with the scope filter on, a review's runs complete together, after the cross-agent signal pick (`run-executor.ts`);
    - `reviewer-core/INSIGHTS.md` [Security]: deterministic scope partition with one signal.
- **Test first:** no test: docs only.
- **Verify:** fact check.
- **Depends on:** S0–S16.

## Skill map
| Step | Paths | Skills |
|---|---|---|
| S0, S17 | `specs/**`, `docs/**`, READMEs, INSIGHTS | fact check, engineering-insights |
| S1 | `*/src/vendor/shared/contracts/**`, `server/src/modules/reviews/**`, `server/test/**` | shared-contracts, zod, onion-architecture, fastify-best-practices, frontend-architecture, react-best-practices, next-best-practices, test-strategy, engineering-insights |
| S2 | `*/src/vendor/shared/adapters.ts`, `server/src/adapters/**` | the S1 set + security |
| S3 | `server/src/db/**`, `server/src/modules/intent/repository.ts` | db-schema-change, drizzle-orm-patterns, postgresql-table-design, onion-architecture, fastify-best-practices, test-strategy, engineering-insights |
| S4, S5 | `reviewer-core/src/**` | typescript-expert, security, test-strategy, engineering-insights |
| S6, S7, S9–S11 | `server/src/modules/intent/**`, `server/src/modules/reviews/**` | onion-architecture, fastify-best-practices, security (+ zod, db-schema-change for S9–S11), test-strategy, engineering-insights |
| S8 | `vendor/shared/contracts/platform.ts`, `client/src/lib/**` | shared-contracts, zod, frontend-architecture, react-best-practices, next-best-practices, react-testing-library, test-strategy, engineering-insights |
| S12–S15 | `client/src/**`, `client/messages/**` | frontend-architecture, react-best-practices, next-best-practices, react-testing-library, test-strategy, engineering-insights (+ e2e-flows for S15) |
| S16 | `server/src/db/seed.ts`, `e2e/**` | db-schema-change, drizzle-orm-patterns, e2e-flows, test-strategy, engineering-insights |

## Verification matrix (after the last step)
| Package | Commands |
|---|---|
| reviewer-core | `cd reviewer-core && npm run typecheck && npm test` |
| server | `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'`; each touched `.it.test.ts` on a fresh `devdigest_it` DB (`intent-repository`, `intent`, `reviews-intent`, `reviews-scope-signal`, `reviews`, `reviews-skills`, `skills-injection`) |
| client | `cd client && pnpm typecheck && pnpm test` (+ `pnpm build` with dev stopped) |
| e2e | `cd e2e && npm run typecheck && npm run e2e:hermetic` |
| mirror | `diff` empty for brief / review-api / findings / trace / platform; `adapters.ts` drift not grown |

## Risks & mitigations
| Risk | Likelihood | Mitigation in plan |
|---|---|---|
| Auto-classify makes existing `.it` tests hit real OpenRouter/GitHub | High | S10 harness mocks; S17 insight |
| With the filter on, fast agents stay `running` until the slowest agent finishes | Medium | Only when the filter is on; Live Log says "waiting for N other agent(s)"; existing per-call timeouts bound the wait; filter off = today's timing |
| A crash between phase 1 and phase 2 loses computed results | Low | Runs are still `running`, so the boot reaper marks them failed (`app.ts:70`); the user re-runs |
| The winner's finalize fails and the signal is lost | Low | Re-pick from runs not yet finalized; `signal lost` logged |
| Cancel during the wait races with finalize | Low | `isCancelled` checked before pick and before persist; residual ms race same as today |
| The scope filter drops a real defect | Medium | Eligibility includes security WARNING; filter off for stale or low-confidence intents; null scope is kept; drops logged |
| Re-running a single agent later adds another signal for the PR | Medium | Rule is "per review execution" (agreed); the PR summary still takes the newest review per agent |
| The model ignores `json_schema` on an endpoint | Low | Proven `gpt-4.1-mini`; `parseWithRepair` + 1 retry |
| Bare `#N` matches noise or a PR | Medium | Cap of 3; `not_found` goes to missing_context and never fails the call |
| Concurrent detections for one PR | Low | Idempotent upsert, last one wins; rate limit |
| Staleness misses a linked-issue edit | Low | Manual re-detect; source statuses logged |
| `adapters.ts` mirror drift grows | Low | S2 checks with `diff | wc -l` |

## Out of scope
- Risk areas (removed: no field, no UI).
- Jira/Linear/other-host fetching; GraphQL `closingIssuesReferences`.
- OpenRouter `provider.require_parameters`.
- A kill-switch for auto-classification.
- Persisting the linked issue at import; fixing the `octokit.ts:128` regex.
- Re-classifying automatically on head change; an in-flight lock per PR.
- Showing intent cost in the PR list.
- **For the architecture reviewer:**
  - the imports `intent → reviews/diff-loader` and `reviews/run-executor → intent/service`;
  - the compute/finalize split of the executor.
- **For the security reviewer:**
  - scope-filter gaming analysis (eligibility rule, D9 gating);
  - private repo text sent to the LLM provider.

## Decisions (agreed 2026-10-08)
| # | Question | Decision |
|---|---|---|
| 1 | Field rename | Contract field `intent` → `summary`. The SQL column `pr_intent.intent` is kept and mapped as `summary: text('intent')`, because a rename makes drizzle-kit interactive. Dead repository code is removed. |
| 2 | Sources v1 | Title, body, branch, commits, files + hunk headers (never bodies). Same-repo GitHub issues (≤ 3) and repo `.md` plans/specs (≤ 3) fetched at the head SHA through the GitHub API. Other hosts and ticket keys are recorded as missing context, never fetched. |
| 3 | Prompt location | Classifier prompt, confidence, scope partition and signal helpers are in reviewer-core (pure, add-only exports). |
| 4 | Classifier model (Q1) | `openrouter / openai/gpt-4.1-mini`. `openai/gpt-5.6-terra` was considered and rejected: a reasoning model at $2/$12 per 1M tokens. |
| 5 | Risk areas (Q2) | Removed entirely: no field, no UI. |
| 6 | Signal eligibility (Q3) | CRITICAL, or WARNING with category `security`. |
| 7 | Signal cardinality (Q4) | Exactly one out-of-scope signal per review execution across all agents. Each agent yields at most one candidate; the executor picks the winner after all agents settle (severity → confidence → job order → file → line → title) and finalizes runs in two phases. |
| 8 | `require_parameters` (Q5) | Unchanged; out of scope. |
| 9 | Kill-switch (Q6) | Not added. |
| 10 | Auto-classify on review (Q7) | Yes, when no intent is stored. A stale intent is used as-is and logged; re-detect stays manual. A failure degrades the review. |
| 11 | When the filter applies | Only for a fresh intent with confidence ≠ low; otherwise the intent is context only. |
| 12 | Staleness | Head SHA moved, or the hash of prompt version + title + body changed. |
| 13 | UI placement | IntentCard above the tab content on Overview and Agent runs. Strings in `prReview.json`. FindingCard shows "Outside PR scope". |
| 14 | Spec / plan names | `specs/L03-intent-layer.md` · `specs/plans/2026-10-08-intent-layer.md`. |

Files the plan cites most (absolute paths):
- `/Users/ivan/workspace/ai-engineering-course/dev-digest/server/src/modules/reviews/run-executor.ts`
- `/Users/ivan/workspace/ai-engineering-course/dev-digest/reviewer-core/src/review/run.ts`
- `/Users/ivan/workspace/ai-engineering-course/dev-digest/reviewer-core/src/review/reduce.ts`
- `/Users/ivan/workspace/ai-engineering-course/dev-digest/reviewer-core/src/prompt.ts`
- `/Users/ivan/workspace/ai-engineering-course/dev-digest/reviewer-core/src/index.ts`
- `/Users/ivan/workspace/ai-engineering-course/dev-digest/server/src/vendor/shared/contracts/brief.ts` (also `review-api.ts`, `findings.ts`, `trace.ts`, `platform.ts` in the same folder)
- `/Users/ivan/workspace/ai-engineering-course/dev-digest/server/src/vendor/shared/adapters.ts`
- `/Users/ivan/workspace/ai-engineering-course/dev-digest/server/src/db/schema/reviews.ts`
- `/Users/ivan/workspace/ai-engineering-course/dev-digest/server/src/adapters/mocks.ts`
- `/Users/ivan/workspace/ai-engineering-course/dev-digest/server/src/adapters/github/octokit.ts`
- `/Users/ivan/workspace/ai-engineering-course/dev-digest/server/src/platform/config.ts`
- `/Users/ivan/workspace/ai-engineering-course/dev-digest/client/src/app/repos/[repoId]/pulls/[number]/page.tsx`
- `/Users/ivan/workspace/ai-engineering-course/dev-digest/client/src/lib/feature-models.ts`

insights: none recorded (I'm read-only); S17 lists four for the implementer.
