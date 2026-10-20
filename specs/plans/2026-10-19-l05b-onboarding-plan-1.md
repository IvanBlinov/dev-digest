# Development Plan: Onboarding Generator, Plan 1 of 2 (server + shared + reviewer-core + seed)

**Spec:** specs/L05b-onboarding-generator.md (SPEC-02, approved, revised in 2e39975) · **Base commit:** 2e39975
**Packages:** server, @devdigest/shared (server canonical, client mirror), reviewer-core · **Size:** L (15 steps; ~20 KB because test-writer needs exact red-phase cases)
**Execution mode:** multi (chosen by the user 2026-10-19) · **Red phase:** test-writer — S7, S8, S9, S10, S11, S12, S13

Approved by the user 2026-10-19 ("proceed with implementation"). Revised 2026-10-19 after the cross-model review ([review](2026-10-19-l05b-onboarding-plan-1-review.md); rows 2, 4, 5, 6, 8 became test cases in S7, S8, S12, S13).

## Goal
`POST /repos/:id/onboarding/generate` builds a five-section tour from deterministic repo facts and makes exactly one narrative LLM request (no reprompt, no transport retry). `GET /repos/:id/onboarding` returns the stored tour with an honest status, staleness and failure reason. The seeded repo has a ready tour.

## Acceptance criteria (from the spec, unchanged)
- AC-1 to AC-7 (202 / GET state / none / 409 running / 409 not cloned / 429 / interrupted) → `test/onboarding.it.test.ts` · S13
- AC-8 to AC-10, AC-13 (single tour, keep previous, skeleton, cascade) → `test/onboarding-repository.it.test.ts`, `onboarding-schema.it.test.ts` · S3, S11, S13
- AC-11, AC-22 (tour metadata, generation stats) → `test/onboarding-generator.test.ts`, `contracts.test.ts` · S1, S12
- AC-12 (stale) → `test/onboarding-helpers.test.ts`, `onboarding.it.test.ts` · S10, S13
- AC-14 to AC-16, AC-18 to AC-20 (one request, no key, caps, failure reasons, log line) → `onboarding-generator.test.ts`, `llm-no-retry.test.ts` · S5, S12
- AC-17 (feature model default) → `test/feature-models.test.ts` · S2
- AC-21, AC-25, AC-26 (prompt event, untrusted fencing, budget) → `reviewer-core/test/onboarding-prompt.test.ts`, `onboarding-generator.test.ts` · S9, S12
- AC-23, AC-24, AC-32 to AC-34 (allowlist, env names, commands) → `test/onboarding-facts.test.ts`, `onboarding-helpers.test.ts` · S4, S7, S10
- AC-27 to AC-31, AC-35, AC-37, AC-40, AC-44, AC-45 (deterministic sections) → `test/onboarding-sections.test.ts` · S6, S8
- AC-36, AC-38, AC-39, AC-41 to AC-43 (LLM merge and validation) → `onboarding-helpers.test.ts` · S10
- AC-69 (contracts) → `contracts.test.ts` + `diff` · S1, S4
- AC-71 (mock: 1 request, `llm_calls=1`, rank order) → `onboarding-generator.test.ts` · S12
- AC-70, data part (seeded ready tour) → `test/seed-onboarding.test.ts` · S14 (the e2e flow is in Plan 2)

## Requirements decisions
| # | Question / recommendation | Decision | Effect on the plan |
|---|---|---|---|
| Q1 | Turning off transport retry | No-retry provider instance from `container.llm(id, { retries: 0 })`; request `maxRetries: 0`; no port change | S5 |
| Q2 | Where the prompt lives | reviewer-core `src/onboarding/prompt.ts`; export the generic guard sentence; strict escape helper; manifest via `measure`; additive exports only | S9 |
| Q3 | Storage | One migration extending `onboarding`; idle-guarded start with an advisory lock | S3, S11 |
| Q4 | Reading repo files | `GitClient.listDir` (names only) plus the labelled server→client `adapters.ts` drift fix | S4 |
| Q5 | AC-50 control | Spec revised to `POST /repos/:id/refresh` | Plan 2 only |
| R1 to R15 | Recommendations | All accepted. R13 is now in AC-32 (scripts from the root `package.json`) | see Key constraints |
| D1 | AC-7 and AC-10 overlap for `interrupted` | An interrupted generation has no facts to build from, and GET must stay ≤ 300 ms (NFR-3). So it never builds a skeleton: GET returns `failed`, `last_error.reason=interrupted`, and the kept tour or `null` | S11, S13 |

## Key constraints
| Source (file:line) | Rule or insight | Effect on this plan |
|---|---|---|
| `server/src/platform/jobs.ts:42,66` | JobRunner retries the whole handler 2 times | Generation runs as a background promise (conventions pattern, `conventions/service.ts:118-128`), never through JobRunner |
| `server/src/adapters/llm/openai.ts:52,97`; `reviewer-core/src/llm/openrouter.ts:55` | `withRetry` plus SDK `maxRetries` can multiply requests | S5 sets both to 0 for the no-retry instance |
| `server/src/app.ts:99` | The rate-limit plugin is not registered when `nodeEnv==='test'` | The AC-6 test builds the app with `nodeEnv: 'development'` |
| `server/src/modules/repo-intel/repository.ts:482` | No tie-break on rank | S6 adds `asc(file_path)` |
| `server/src/modules/repo-intel/service.ts:712-731` | `isJunkPath` misses root-level `test/` and `migrations/` | S8 adds a local `isOnboardingExcluded`; the shared helper is untouched |
| `server/src/modules/repo-intel/service.ts:189-204` | A missing index row comes back as `no_data` with `lastIndexedSha ''` | Treated as "no index state" (AC-12, AC-44) |
| `server/src/platform/prompt-log.ts:27,31,57` | `promptKind` allows review / intent only; `prId` is required | S9 adds `'onboarding'`, makes `prId` optional, adds `repoId` |
| `reviewer-core/src/prompt.ts:17,68` | The guard is private; `wrapUntrusted` escapes only an exact `</untrusted>` | S9 |
| `server/src/adapters/mocks.ts:317`; `server/INSIGHTS.md` (2026-09-30) | `MockGitClient.readFile` returns `''` for a missing file | The fact reader treats `''` and a throw both as "missing" |
| Root `INSIGHTS.md` (2026-09-29) | `adapters.ts` copies already drift | S4 copies the server file over the client one, as a labelled step |

## Constraints hit
- **Migrations:** S3 edits the schema only, then runs `pnpm db:generate` and `pnpm db:migrate`. The generated SQL is never edited by hand.
- **`reviewer-core/src/index.ts`:** additions only (S9). After each reviewer-core change, run `cd server && pnpm typecheck`.
- **vendor/shared:** server copy first, then mirror. `diff` must print nothing for `contracts/onboarding.ts`, `index.ts`, `contracts/platform.ts` and `adapters.ts`.
- **Secrets:** a missing key is detected only through the `ConfigError` that `container.llm` throws (`container.ts:194-210`).

## Contract & data changes
| Contract / table | Before → after | Optional/nullable choice | Consumers to update |
|---|---|---|---|
| `contracts/onboarding.ts` (new) | — → `OnboardingReason`, `OnboardingTour`, `OnboardingTourState`, `OnboardingGenerateResponse`, `OnboardingNarrative` | `.nullable()` where the spec says nullable; snake_case keys | onboarding routes/service; client (Plan 2) |
| `FEATURE_MODELS.onboarding` | `deepseek/deepseek-v4-flash` → `openai/gpt-4.1-mini` | — | `client/src/lib/feature-models.ts:19` |
| `GitClient` | adds `listDir(repo, dir): Promise<string[]>` | — | simple-git adapter, `MockGitClient` |
| `onboarding` table | `json` NOT NULL → nullable; adds `status` text NOT NULL default `'none'`, `started_at` timestamptz null, `last_error` jsonb null, `prompt_version` text null, `index_sha` text null | new columns nullable (the table has no rows today) | onboarding repository, seed |
| `IndexState` (server type) | adds `filesTotal?: number \| null`, `bounded?: number` from `stats.totalCandidates` and `stats.bounded` | optional | facade only |

## Steps

### S1 — Onboarding contracts  [package: server+client · layer: contracts]
- **Skills:** shared-contracts, zod, test-strategy, engineering-insights
- **Files:** create `server/src/vendor/shared/contracts/onboarding.ts`; modify `server/src/vendor/shared/index.ts` (one `export *` line); mirror both files to `client/src/vendor/shared/`.
- **Test first:** `server/test/contracts.test.ts`. Cases:
  - "AC-69: OnboardingTour parses a full sample" → passes.
  - "AC-69: rejects status 'generating' in OnboardingTour" → fails.
  - "AC-11: requires index_sha (nullable), prompt_version, generated_at, coverage, reasons, generation" → a sample missing `generation` fails.
  - "AC-2: OnboardingTourState accepts tour null and stale_reason null" → passes.
  - "AC-69: existing Onboarding schema still parses {sections: []}" → passes.
- **Implement:** the shapes the later steps rely on.
  - `OnboardingTour = { status: ready|partial|skeleton, index_sha, prompt_version, generated_at, coverage{files_indexed, files_total|null, partial}, reasons: OnboardingReason[], known_paths: string[], generation{provider, model, llm_calls, tokens_in, tokens_out, cost_usd|null, duration_ms}, sections{ architecture, critical_paths, run_commands, reading_path, first_tasks } }`.
  - Each section has `source: llm|deterministic` and `unavailable_reason: OnboardingReason|null`.
  - `architecture{narrative, diagram: {nodes[{id, label, kind: module|service}], edges[{from, to}]} | null}`.
  - `critical_paths.items[{path, fact, reason|null}]`.
  - `run_commands.items[{id, command, comment|null, script_body|null}]`.
  - `reading_path.items[{path, why, why_source}]`.
  - `first_tasks.items[{title, description, paths[]}]`.
  - `OnboardingNarrative` (the LLM schema) has **no** `.max()` caps, so over-long text is truncated by AC-43 rather than rejected: `{architecture: string, critical_path_reasons[{path, reason}], commands[{id, comment}], reading_path[{path, why}], first_tasks[{title, description, paths[]}]}`.
- **Verify:** `cd server && pnpm exec vitest run test/contracts.test.ts && pnpm typecheck`; `cd client && pnpm typecheck`; `diff` of both files prints nothing.
- **Depends on:** —
- **Done when:** AC-69, AC-2 and AC-11 shapes exist.

### S2 — Onboarding feature-model default  [package: server+client · layer: contracts]
- **Skills:** shared-contracts, test-strategy
- **Files:** modify `server/src/vendor/shared/contracts/platform.ts:50` and its mirror; `client/src/lib/feature-models.ts:19`; `server/test/feature-models.test.ts`.
- **Test first:** "AC-17: onboarding default is openrouter / openai/gpt-4.1-mini" → `defaultFeatureModel('onboarding')` returns it. Also assert the client mirror is equal, if the existing test does so; otherwise add `client/src/lib/feature-models.test.ts`.
- **Implement:** change the value only.
- **Verify:** `cd server && pnpm exec vitest run test/feature-models.test.ts && pnpm typecheck`; `cd client && pnpm typecheck`; `diff` of `platform.ts` empty.
- **Depends on:** —
- **Done when:** AC-17.

### S3 — Migration on the onboarding table  [package: server · layer: db]
- **Skills:** db-schema-change, drizzle-orm-patterns, postgresql-table-design, test-strategy
- **Files:** modify `server/src/db/schema/context.ts:120`; new generated `server/src/db/migrations/0015_*.sql` plus `meta/` (via `pnpm db:generate`).
- **Test first:** `server/test/onboarding-schema.it.test.ts`.
  - "AC-8: a row with status 'generating' and json null can be inserted".
  - "AC-13: deleting the repo deletes its onboarding row".
- **Implement:** columns as in the Contract table. Run `pnpm db:generate`. Generation must be non-interactive: there are no renames (`server/INSIGHTS.md` 2026-10-08). Then run `pnpm db:migrate`.
- **Verify:** `scripts/it-db.sh run server/test/onboarding-schema.it.test.ts`; `cd server && pnpm typecheck`.
- **Depends on:** —
- **Done when:** AC-8 storage and AC-13 cascade.

### S4 — `GitClient.listDir` + `adapters.ts` drift fix  [package: server+client · layer: contracts / adapter]
- **Skills:** shared-contracts, onion-architecture, security, test-strategy
- **Files:** modify `server/src/vendor/shared/adapters.ts:235` (add `listDir`); **labelled drift fix:** `cp server/src/vendor/shared/adapters.ts client/src/vendor/shared/adapters.ts`; `server/src/adapters/git/simple-git.ts:129`; `server/src/adapters/mocks.ts:317`.
- **Test first:** `server/test/git-list-dir.test.ts`.
  - "AC-23: listDir returns entry names of one directory, sorted, non-recursive" (uses a tmp dir).
  - "AC-23: listDir of a missing dir returns []".
  - "AC-23: listDir rejects a dir containing '..'".
  - "MockGitClient.listDir derives names from opts.files keys".
- **Implement:** `readdir` under `clonePathFor(repo)`; reject `..` and absolute paths.
- **Verify:** `cd server && pnpm exec vitest run test/git-list-dir.test.ts && pnpm typecheck`; `cd client && pnpm typecheck`; `diff` of `adapters.ts` empty.
- **Depends on:** —
- **Done when:** AC-23 file listing exists; NFR-9 holds for `adapters.ts`.

### S5 — No-retry LLM provider instance  [package: server · layer: adapter / platform]
- **Skills:** onion-architecture, fastify-best-practices, test-strategy
- **Files:** modify `server/src/adapters/llm/openai.ts:50` and `anthropic.ts:45` (constructor option `{ retries?: number; baseURL?: string }`, passed to the SDK `maxRetries` and to `withRetry({ retries })`); `server/src/platform/container.ts:182-210` (`llm(id, opts?: { retries?: 0 })`; cache key `id:retries`; overrides still win; OpenRouter gets `maxRetries: opts.retries`).
- **Test first:** `server/test/llm-no-retry.test.ts`. Each test starts a local `node:http` server that answers 500 and counts hits.
  - "AC-14: OpenAIProvider with retries 0 sends one request on a 500".
  - "AC-14: AnthropicProvider with retries 0 sends one request".
  - "AC-14: OpenRouterProvider with maxRetries 0 and req.maxRetries 0 sends one request" (existing `baseURL` option).
  - "container.llm('openrouter', {retries: 0}) is not the cached default instance".
- **Implement:** the default behaviour stays exactly as today when no option is passed.
- **Verify:** `cd server && pnpm exec vitest run test/llm-no-retry.test.ts test/adapters.test.ts && pnpm typecheck`.
- **Depends on:** —
- **Done when:** AC-14 (transport side).

### S6 — repo-intel facade reads for onboarding  [package: server · layer: repository / service]
- **Skills:** onion-architecture, drizzle-orm-patterns, test-strategy
- **Files:** modify `server/src/modules/repo-intel/types.ts:165` (add `getOnboardingGraph(repoId): Promise<{ files: {path, rank}[]; edges: {from, to}[] }>` and `getAllFileFacts(repoId): Promise<{path, endpoints[], crons[]}[]>`; extend `IndexState`); `repository.ts:474` (tie-break, edges, facts); `service.ts` (degraded or flag off → empty arrays); `repository.ts:212-235` (`filesTotal`, `bounded`).
- **Test first:** `server/test/repo-intel-onboarding-reads.it.test.ts`.
  - "AC-35: files ordered by rank desc, ties by path asc" (rows `b.ts` 0.5, `a.ts` 0.5, `c.ts` 0.9 → c, a, b).
  - "AC-44: flag off returns empty graph".
  - "AC-45: index state exposes filesTotal and bounded from stats".
- **Verify:** `scripts/it-db.sh run server/test/repo-intel-onboarding-reads.it.test.ts`; `cd server && pnpm typecheck`.
- **Depends on:** —
- **Done when:** the data that AC-28, 30, 35, 45 and 49 need is readable.

### S7 — Fact reader and command derivation  [package: server · layer: service + helpers] (red phase)
- **Skills:** onion-architecture, security, test-strategy
- **Files:** create `server/src/modules/onboarding/constants.ts` (every NFR-1 server constant, plus `ONBOARDING_MAX_TASK_TITLE_CHARS` 120, `ONBOARDING_MAX_TASK_DESCRIPTION_CHARS` 300, `ONBOARDING_MAX_SCRIPT_BODY_CHARS` 200); `facts.ts` (`readCloneFacts(git, ref, topLevelDirs)`); `helpers.ts` (pure parsers and `deriveCommands`).
- **Test first:** `server/test/onboarding-facts.test.ts`. It uses `MockGitClient` with spies on **every** `readFile` and `listDir` call.
  - Fixture: root `listDir` returns `.env`, `.env.local`, `id_rsa`, `cert.pem`, `key.json`, `README.md`, `.env.example`, `pnpm-lock.yaml`, `docker-compose.yml`, `Makefile`, `package.json`, `src`, `docs`. `files` includes `docs/README.md`, `src/index.ts` and `api/package.json`.
  - "AC-23: every readFile path is on the allowlist". Every recorded path matches one of: a root `README*` (no `/`), `package.json` or `<topdir>/package.json`, root `docker-compose*.yml` / `compose*.yml`, `.env.example`, `Makefile`. `listDir` is called only for the root (`''`).
  - "AC-23: never reads .env, .env.local, id_rsa, cert.pem, key.json or lockfile bodies (pnpm-lock.yaml)".
  - "AC-23: never reads a nested docs/README.md or an arbitrary src/index.ts".
  - "AC-23: README excerpt capped at 4000 chars".
  - "AC-24: .env.example with 25 `NAME_i=secret` lines → 20 names; `secret` appears nowhere in the facts".
  - "AC-32: lockfile → package manager". `pnpm-lock.yaml` → `pnpm install`; `yarn.lock` → `yarn install`; `package-lock.json` or no lockfile → `npm install`.
  - "AC-32: order and cap": install; `cp .env.example .env` (comment = the names joined with ', ', at most 80 characters); `docker compose up -d api db`; `<pm> run` for the scripts dev, start, build, test (only those present in the **root** `package.json`, in that order); `make` for the targets setup, install, dev, run, start, test. Capped at 6, with ids `install`, `env`, `compose`, `script:<name>`, `make:<target>`.
  - "AC-32: scripts of api/package.json produce no commands".
  - "AC-34: no package.json, compose file or Makefile → empty command list".
  - "script_body is truncated to 200 chars".
- **Implement:** parse compose services by indentation (no YAML dependency). Treat `''` and a throw both as "missing". The implementer must not edit the red-phase test file.
- **Verify:** `cd server && pnpm exec vitest run test/onboarding-facts.test.ts && pnpm typecheck`.
- **Depends on:** S4
- **Done when:** AC-23, AC-24, AC-32, AC-34.

### S8 — Deterministic sections  [package: server · layer: helpers] (red phase)
- **Skills:** onion-architecture, test-strategy
- **Files:** create `server/src/modules/onboarding/sections.ts` (pure).
- **Test first:** `server/test/onboarding-sections.test.ts`.
  - **Base fixture.** Files and ranks: `src/app.ts` 0.9, `src/db.ts` 0.7, `src/util.ts` 0.7, `test/app.test.ts` 0.95, `src/types.d.ts` 0.8, `migrations/001.ts` 0.85, `vite.config.ts` 0.6. Edges: app→db, app→util, util→db. Facts: app has 3 endpoints.
  - "AC-35: reading path = src/app.ts, src/db.ts, src/util.ts" (rank desc, ties by path asc; tests, `.d.ts`, migrations and configs excluded).
  - "AC-35: 12 eligible ranked files → exactly 8, the top 8 by rank".
  - "AC-36: default why = 'Imported by 2 files' for src/db.ts and 'Imported by 1 file' for src/util.ts".
  - "AC-37: no edges → reading path unavailable with no_graph and items []".
  - "AC-30: critical paths = endpoint/cron files ∪ `getCriticalPaths` chains" (rank desc; excluded kinds dropped).
  - "AC-30: a file with crons and no endpoints is a critical-path entry".
  - "AC-30: 9 candidate files → exactly 5, by rank desc then path asc".
  - "AC-31: fact = '3 endpoints · imported by 0 files'" (singular forms: '1 endpoint', '1 cron', '1 file').
  - "AC-28: module and edge rules" (module = first path segment after stripping a single shared top-level dir; a module edge exists when any file imports across modules).
  - "AC-28: 10 top-level dirs → exactly 8 module nodes, the 8 with the highest summed rank".
  - "AC-28: compose with 6 services → exactly 4 service nodes, the first 4 in file order".
  - "AC-29: empty graph → diagram null with no_graph".
  - "AC-44: index degraded, missing or flag off → reading path, critical paths and diagram unavailable with index_degraded".
  - "AC-27: the deterministic summary names the stack, the modules and 'N endpoints'".
  - "AC-40: known_paths = every path present in the facts".
  - "AC-45: index partial, or bounded > 0 → coverage.partial true and reason index_partial".
- **Implement:** the implementer must not edit the red-phase test file.
- **Verify:** `cd server && pnpm exec vitest run test/onboarding-sections.test.ts && pnpm typecheck`.
- **Depends on:** S1, S6
- **Done when:** AC-27 to AC-31, AC-35, AC-37, AC-40, AC-44, AC-45.

### S9 — Onboarding prompt in reviewer-core + prompt log kind  [package: reviewer-core+server · layer: reviewer-core / platform] (red phase: prompt, escape and budget assertions only)
- **Skills:** typescript-expert, security, onion-architecture, test-strategy
- **Files:** modify `reviewer-core/src/prompt.ts:17` (export `UNTRUSTED_DATA_RULE`, the first sentence; `INJECTION_GUARD` = rule + the rest, same bytes; add `escapeUntrustedMarkers` and `wrapUntrustedStrict`); create `reviewer-core/src/onboarding/prompt.ts` (`buildOnboardingMessages(facts, meter, { maxInputTokens })` → `{ messages, sections, dropped }`; `ONBOARDING_PROMPT_VERSION`); `reviewer-core/src/index.ts` (additive exports); `server/src/platform/prompt-log.ts:27-57`; delete the unused `server/src/prompts/onboarding.system.md`.
- **Test first:** `reviewer-core/test/onboarding-prompt.test.ts`, with a fake meter (`tokens = ceil(chars/4)`).
  - "AC-25: every repo-derived fact is inside an `<untrusted` block and the system prompt contains UNTRUSTED_DATA_RULE".
  - "AC-25: README containing `<untrusted>`, `</UNTRUSTED >`, `< /untrusted` → matches of `/<\s*\/?\s*untrusted/i` equal 2 × block count".
  - "AC-26: oversize facts drop readme, then repo_map, then symbols of the lowest rank first, then endpoints beyond 10, in that order; `dropped` lists the groups; total tokens ≤ 8000; stack, commands, reading-path and critical-path paths always present".
  - "AC-21: sections carry name/source/trust/chars/tokens and no text field".
  - "INJECTION_GUARD bytes unchanged" (the existing `prompt.test.ts` stays green).

  Also `server/test/prompt-log-helpers.test.ts`: "AC-21: promptKind 'onboarding' event without prId carries repoId and no text".
- **Verify:** `cd reviewer-core && npm test -- test/onboarding-prompt.test.ts test/prompt.test.ts && npm run typecheck`; `cd server && pnpm exec vitest run test/prompt-log-helpers.test.ts && pnpm typecheck`.
- **Depends on:** —
- **Done when:** AC-21, AC-25, AC-26 (prompt side).

### S10 — Narrative merge, validation, status, staleness  [package: server · layer: helpers] (red phase)
- **Skills:** onion-architecture, security, test-strategy
- **Files:** modify `server/src/modules/onboarding/helpers.ts` (`mergeNarrative`, `tourStatus`, `truncateAt`, `deriveStale`, `formatDoneLine`).
- **Test first:** `server/test/onboarding-helpers.test.ts`.
  - "AC-33: unknown command ids dropped, missing ids appended in AC-32 order, the LLM order is kept for known ids, the comment is capped at 80 chars, command text always comes from the deterministic list".
  - "AC-36: an LLM reading-path item for an unlisted path is ignored; the order stays as in AC-35 even when the LLM reverses it; a missing or empty why keeps 'Imported by N files' with why_source deterministic".
  - "AC-31: a critical-path reason over 120 chars is truncated; no reason → null".
  - "AC-38: ≤ 3 tasks; a task with no known path is dropped; unknown paths are removed from a kept task; title ≤ 120, description ≤ 300".
  - "AC-39: no valid task or no narrative → first_tasks deterministic, items [], unavailable_reason = the failure reason, or invalid_output when every task is dropped".
  - "AC-43: a 1600-char narrative → 1500 chars ending in '…'".
  - "AC-41: every section has source and unavailable_reason".
  - "AC-42: all sections llm and none unavailable → ready; any deterministic or unavailable → partial; narrative null → skeleton".
  - "AC-12: index sha differs → stale index_moved (it wins over prompt_changed); prompt version differs → prompt_changed; no index state → stale false".
  - "AC-20: formatDoneLine → `onboarding: done repo=R status=ready llm_calls=1 tokens_in=100 tokens_out=50 cost_usd=0.001 duration_ms=5 reasons=-`; with trimming: `reasons=budget_trimmed dropped=readme,repo_map`; cost null → `cost_usd=null`".
- **Verify:** `cd server && pnpm exec vitest run test/onboarding-helpers.test.ts && pnpm typecheck`.
- **Depends on:** S1, S7, S8
- **Done when:** AC-12 (logic), AC-20 (format), AC-31, AC-33, AC-36, AC-38, AC-39, AC-41 to AC-43.

### S11 — Onboarding repository  [package: server · layer: repository] (red phase)
- **Skills:** onion-architecture, drizzle-orm-patterns, test-strategy
- **Files:** create `server/src/modules/onboarding/repository.ts`: `get`, `startIfIdle` (advisory lock `onboarding:<repo>`, copied from `conventions/repository.ts:89-103`), `finishSuccess`, `finishFailure(reason, skeleton|null)`, `failStale(olderThanMs)`.
- **Test first:** `server/test/onboarding-repository.it.test.ts`.
  - "AC-4: two concurrent startIfIdle → exactly one row with status generating, the other returns undefined".
  - "AC-8: finishSuccess stores the tour as the only row".
  - "AC-9: a failure after a stored ready/partial tour keeps the tour unchanged, sets status failed and last_error {reason, at}".
  - "AC-10: a failure with no stored tour stores the skeleton and status skeleton with last_error".
  - "AC-7: failStale(600000) turns a 'generating' row with started_at 11 min ago into failed / interrupted, keeping any tour".
- **Verify:** `scripts/it-db.sh run server/test/onboarding-repository.it.test.ts`; `cd server && pnpm typecheck`.
- **Depends on:** S3
- **Done when:** AC-4 (guard), AC-7 to AC-10 (storage).

### S12 — Generator: one narrative call  [package: server · layer: service] (red phase)
- **Skills:** onion-architecture, security, test-strategy
- **Files:** create `server/src/modules/onboarding/generator.ts`: `generateOnboarding({ repo, workspaceId }, deps)`, where `deps = { repoIntel, git, resolveModel, llm(provider) /* throws ConfigError without key */, tokenizer, log(line), promptLog(event), now }`. It returns `{ tour, failure: OnboardingReason|null }`. `deps.log` and `deps.promptLog` are its **only** logging channels.
- **Test first:** `server/test/onboarding-generator.test.ts`. Harness: `MockLLMProvider` (cost 0.001), `MockGitClient`, a fake RepoIntel (the S8 graph), and **one captured sink** that records every `log` and `promptLog` call in order.
  - "AC-71 / AC-15: cloned repo with a key → exactly 1 completeStructured call; `llm_calls=1`; reading path = the fixture's rank-desc order".
  - "AC-20 / AC-21 / NFR-4: the sink holds exactly 2 records — one `prompt.assembled` event (promptKind onboarding), then one line starting `onboarding: done` — and nothing else". Asserted for each of: success, no key, llm_error.
  - "AC-14 / AC-18: the request has maxRetries 0, timeoutMs 60000, maxTokens 3000, temperature 0.2".
  - "AC-17: the model comes from resolveModel('onboarding')".
  - "AC-16: llm() throws ConfigError → 0 calls, `llm_calls=0`, no_api_key, skeleton".
  - "AC-19: failure reasons": a provider error → llm_error; a `TimeoutError` → llm_timeout; schema failure → invalid_output; each produces a skeleton with that reason.
  - "AC-22: generation = {provider, model, llm_calls 1, tokens_in 100, tokens_out 50, cost_usd 0.001, duration_ms}".
  - "AC-11: tour metadata": `index_sha` = lastIndexedSha (null without an index state); `prompt_version` and `coverage` are set.
  - "NFR-4: sink records contain no README text and no narrative text".
  - "AC-26: an oversize README → reasons include budget_trimmed and the done line has `dropped=readme`".
  - "AC-44: degraded index → partial when the LLM succeeds, skeleton when it fails".
  - "AC-45: partial index → coverage.partial true".
  - "AC-23: `.env` is never read".
  - "NFR-3: fact collection ≤ 10 s with 5000 files": the fake RepoIntel has 5000 ranked files and about 15000 edges; a `MockLLMProvider` subclass records `Date.now()` when it is called; assert (call time − start) ≤ 10000 ms, measured once.
- **Implement:** in S13, `deps.llm` is wired to `container.llm(p, { retries: 0 })`. The implementer must not edit the red-phase test file.
- **Verify:** `cd server && pnpm exec vitest run test/onboarding-generator.test.ts && pnpm typecheck`.
- **Depends on:** S5, S7–S10
- **Done when:** AC-11, AC-14–AC-22, AC-26, AC-44, AC-45, AC-71; the NFR-3 fact-collection bound holds.

### S13 — Service, routes, registration  [package: server · layer: service / route] (red phase)
- **Skills:** onion-architecture, fastify-best-practices, security, test-strategy
- **Files:** create `server/src/modules/onboarding/service.ts` (copy the `ConventionsService` shape: `inflight` map, `settle()`, `failStale` on GET and POST, `withTimeout` around the job, `AppError('onboarding_generation_running', …, 409)`, `AppError('repo_not_cloned', …, 409)`); `routes.ts` (GET → `OnboardingTourState`; POST → 202 with `config.rateLimit {max: 6, timeWindow: '1 minute'}`; `onClose` → `settle`); modify `server/src/modules/index.ts:14` (register the module).
- **Test first:** `server/test/onboarding.it.test.ts`. Harness: `buildApp` with overrides `llm: { openrouter: MockLLMProvider }` and `MockGitClient`; a repo with `clonePath` set.
  - "AC-3: no tour → status none, tour null, cloned true".
  - "AC-1: POST → 202 {status:'generating'}; after settle, GET returns ready or partial with a tour".
  - "AC-4: POST while running → 409 onboarding_generation_running; mock calls stay at 1".
  - "AC-5: clonePath null → POST 409 repo_not_cloned with 0 LLM calls; GET cloned false".
  - "AC-6: app with nodeEnv 'development' → the 7th POST within a minute gets 429".
  - "AC-7: a generating row started 11 min ago → GET failed / interrupted; then POST → 202".
  - "AC-8: tour readable from a fresh buildApp on the same DB".
  - "AC-9: a second run that fails → GET failed, previous tour kept, last_error set".
  - "AC-10: first run fails → skeleton".
  - "AC-12: index-state row with a different sha → stale true / index_moved".
  - "AC-13: DELETE /repos/:id → the onboarding row is gone".
  - "AC-2: the response parses as OnboardingTourState".
  - "NFR-2: GET starts no generation in any stored state": insert a row directly for each state (none, generating fresh, generating started > 10 min ago, ready, partial, skeleton, failed); GET twice each; the mock call count is unchanged, `inflight` stays empty (`service.settle()` resolves at once) and `started_at` is unchanged — except that the stale row becomes `failed`, as AC-7 requires.
  - "NFR-3: GET p95 ≤ 300 ms with a stored ready tour": a row shaped like the S14 seed tour on the it-db test database (S13 runs before S14, so no `pnpm db:seed` data); 1 warm-up, then N=20 sequential `app.inject` GETs; p95 = the 19th fastest ≤ 300 ms.
- **Implement:** the implementer must not edit the red-phase test file.
- **Verify:** `scripts/it-db.sh run server/test/onboarding.it.test.ts`; `cd server && pnpm typecheck`.
- **Depends on:** S11, S12
- **Done when:** AC-1 to AC-13; NFR-2 (no LLM call from GET) and the NFR-3 GET bound hold.

### S14 — Seed a ready tour  [package: server · layer: db]
- **Skills:** db-schema-change, test-strategy
- **Files:** create `server/src/db/seed-onboarding.ts` (`SEED_ONBOARDING_TOUR`, built with `ONBOARDING_PROMPT_VERSION`, `index_sha` null, paths from seeded PR files `seed.ts:82-89`); modify `server/src/db/seed.ts:175` (idempotent upsert, status ready).
- **Test first:** `server/test/seed-onboarding.test.ts`. "AC-70: the seed tour parses OnboardingTour, has status ready, five llm sections, cited paths ⊆ known_paths, the current prompt_version and llm_calls 1".
- **Verify:** `cd server && pnpm exec vitest run test/seed-onboarding.test.ts && pnpm typecheck`.
- **Depends on:** S1, S3, S9
- **Done when:** AC-70 (data part).

### S15 — Insights  [package: server · layer: docs]
- **Skills:** engineering-insights
- **Files:** modify `server/INSIGHTS.md` (JobRunner retries the whole handler; per-route rate limits are inert in test; `isJunkPath` root-level gap; the no-retry LLM instance).
- **Test first:** no test (docs only).
- **Verify:** every cited `file:line` exists.
- **Depends on:** S13
- **Done when:** the insights are recorded.

## Execution
Run with `/implement specs/plans/2026-10-19-l05b-onboarding-plan-1.md`.
- **Red phase first:** test-writer writes the S7 to S13 tests from the Test-first cases above, and the red run confirms they fail. The implementer must **not edit those test files**; any disagreement is reported as a deviation.
- **Implementer ranges (multi):** S1–S6 · S7–S11 · S12–S15. Each range ends with every package type-checking.
- Then architecture-reviewer → fix loop (at most 3 rounds) → plan-verifier.
- Every gate goes through `scripts/gate.sh`. Commit once per stage.

## Verification matrix (run after the last step)
| Package | Commands |
|---|---|
| server | `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'`, plus `scripts/it-db.sh run` for each of: `onboarding-schema`, `onboarding-repository`, `onboarding`, `repo-intel-onboarding-reads` |
| reviewer-core | `cd reviewer-core && npm run typecheck && npm test`, then `cd server && pnpm typecheck` |
| client (mirror only) | `cd client && pnpm typecheck`; `diff` of the four touched vendor/shared files prints nothing |
| seed | `cd server && pnpm db:migrate && pnpm db:seed` (run twice: idempotent) |

## Risks
| Risk | Likelihood | Mitigation in plan |
|---|---|---|
| The SDK or an adapter retries anyway | M | S5 tests against a real HTTP endpoint and counts hits |
| `drizzle-kit generate` prompts or produces unexpected SQL | L | S3 adds columns only; review the SQL before migrating |
| Fact collection > 10 s on a 5000-file index (NFR-3) | L | One `getOnboardingGraph` query plus in-memory graph work; timing tests in S12 (facts) and S13 (GET p95) |
| Copying `adapters.ts` over the client breaks the client | L | Types only; `cd client && pnpm typecheck` in S4 |
| Seeded tour drifts from the contract | M | S14 test parses it with the contract |

## Out of scope
- **Plan 2 (client + e2e):** AC-46 to AC-68, the e2e flow for AC-70, and the AC-72 demonstration (manual, real key). It uses `POST /repos/:id/refresh` for AC-50 and mirrors the displayed constants.
- Spec Non-goals: no MCP tool, no indexer change, no hotness, no auto-generation.
- Existing drift in `eval-ci.ts` and `productionize.ts`.
- For the reviewers: the no-retry wiring (S5), the strict escape (S9), and the `listDir` path guard (S4).

## Open questions
- D1 (agreed reading): an interrupted generation reports `failed` and keeps the previous tour or `null`; it does not build a skeleton.
- The module rule for the AC-28 diagram (strip one shared top-level dir) is a planner choice that S8 pins in a test.
