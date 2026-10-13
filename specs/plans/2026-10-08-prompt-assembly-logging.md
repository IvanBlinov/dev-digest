# Development Plan: Safe structured logging of prompt assembly (L03d)

**Spec:** none. Step S0 writes `specs/L03d-prompt-assembly-logging.md` (the name is free). · **Base commit:** b6f5d94
**Packages:** reviewer-core, server, client (contract mirror only) · **Size:** M (9 steps)

## Goal
Each prompt build (one per review agent run, one per map-reduce chunk, and one per intent classification) emits a single structured pino event, `prompt.assembled`. The event carries section names, sources, trust, chars, tokens, model and a correlation ID. It never carries section contents, diff text, PR/spec/issue text or secrets. The run's Live Log gets one short human line per build. A verbose mode adds safe detail and works only outside production.

## Acceptance criteria
- AC1: `assemblePrompt` and `buildIntentMessages` return a `sections` manifest `{name, source, trust, chars, tokens?, sha256?, preview?}` with no content field. `preview` is present only on constant sections that reviewer-core authors. Proven by `reviewer-core/test/prompt-manifest.test.ts` and `reviewer-core/test/intent-prompt.test.ts`.
- AC2: `reviewPullRequest` calls `onPromptAssembled` once before the LLM call in single-pass mode, and once per chunk with `chunk {index,total,file}` in map-reduce mode. Proven by `reviewer-core/test/run.test.ts`.
- AC3: `PROMPT_LOG_VERBOSE=1` turns on `config.promptLogVerbose` only when `NODE_ENV !== 'production'`. Under production the flag is ignored and boot logs one warning. Proven by `server/test/config-prompt-log.test.ts`.
- AC4: `redactLogValue` strips URL query, fragment and userinfo, and masks secret-like tokens. The event builder applies it to every string. With verbose off there is no `sha256`/`preview`/per-file/skill detail; with verbose on they are present. Proven by `server/test/prompt-log-helpers.test.ts`.
- AC5: A review execution with 2 agents emits `prompt.assembled` (`promptKind:'review'`) per agent, plus one `promptKind:'intent'` event. All share one `correlationId`, and the same ID is in each run trace's `config.correlation_id`. Proven by `server/test/prompt-logging.it.test.ts`.
- AC6: `POST /pulls/:id/intent` (service `detect`) emits `prompt.assembled` (`promptKind:'intent'`) with the given `correlationId`. The route passes `req.id`. Proven by `prompt-logging.it.test.ts` plus typecheck.
- AC7: No captured log line contains the PR body marker, a diff body line (`stripeKey`, `sk_live_xxx`), spec/issue text markers, or a URL query secret. Proven by `prompt-logging.it.test.ts`.
- AC8: The existing suites stay green, including `intent.it.test.ts:184`. Proven by the verification matrix.

## Key constraints
| Source (file:line) | Rule or insight | Effect on this plan |
|---|---|---|
| `reviewer-core/AGENTS.md` Conventions ("Purity is the contract") | No `process.env`, fs or I/O in reviewer-core | Token counting and sha256 are **injected** as a `SectionMeter {tokens?, digest?}`. Reviewer-core never imports `node:crypto` or reads the verbose flag. |
| `server/AGENTS.md` Boundaries | Prompt assembly lives only in reviewer-core | The server never re-splits prompt text. Sections come from the core manifest. |
| `server/src/platform/run-logger.ts:54-55` | `runLog.event` publishes `data` to the SSE bus **and** pino | The structured event goes straight to `ctx.logger.info(event,'prompt.assembled')`. Only the short summary line goes through `runLog.info`. |
| `server/src/modules/reviews/helpers.ts:87-89` | `taskLine` embeds the PR title and author | The `task` section is marked `trust:'untrusted'` and never gets a preview. Correction to decision 6: the task line is not purely ours. Previews are limited to `system:guard`, `system:scope-rule` and `system:intent`. |
| `server/src/app.ts:50-51` | The logger is `false` when `logLevel` is `silent` (test) | `.it` tests pass a capturing logger to services, as in the pattern at `server/test/intent.it.test.ts:172-180`. No `buildApp` change. |
| `server/test/intent.it.test.ts:184` | Asserts that `components` is in the intent logs | Keep the `intent: classifying` data (`service.ts:221-232`) and **add** `correlationId`. `prompt.assembled` becomes the canonical event. |
| `server/INSIGHTS.md:11-15` | Review `.it` harness must inject `github` and `llm.openrouter` mocks | The new `.it` test reuses `test/helpers/intent-mocks.ts`. |
| `server/src/vendor/shared/contracts/trace.ts:96-103` + shared-contracts rule 1 | `RunTrace` is a jsonb doc, so new keys must be `.nullish()` | Add `config.correlation_id` as nullish. The client mirror is identical today (`diff` is empty). |
| `reviewer-core/src/index.ts:14-82` | Exports are add-only | New types and fields are only added. `components` stays on `buildIntentMessages`. |
| `server/src/platform/config.ts:9-14,34` | Env is read only in config. `NODE_ENV` is an enum | `PROMPT_LOG_VERBOSE` is parsed there. The production gate is computed there. |

## Constraints hit
- Secrets: the event never reads `SecretsProvider`. `redactLogValue` is defense in depth only.
- Contract mirror: one file (`contracts/trace.ts`), copied byte-for-byte in S5.
- No migration, no new dependency (`node:crypto` and `randomUUID` are built in, and `run-logger.ts:1` already uses them).

## Contract & data changes
| Contract / table | Before → after | Optional/nullable choice | Consumers to update |
|---|---|---|---|
| `RunTrace.config` (`server/src/vendor/shared/contracts/trace.ts:97`) | + `correlation_id` | `z.string().nullish()` (old rows lack it) | `run-executor.ts:350` and `:528` (writers). The client mirror is type-only, with no UI change. |
| reviewer-core types (not wire contracts) | + `PromptSection`, `SectionMeter`, `PromptAssembledInfo`; `AssembledPrompt.sections`; `ReviewInput.promptMeter?` / `onPromptAssembled?`; `buildIntentMessages(...).sections` | all optional/additive | server `run-executor.ts`, `intent/service.ts` |

## Steps

### S0 — Spec  [package: root · layer: docs]
- **Skills:** engineering-insights (fact check)
- **Files:** create `specs/L03d-prompt-assembly-logging.md`: Goal, AC1–AC8, Decisions 1–8 from the request, the event shape, the section-name catalogue (below), and a safety list. Add a line to `specs/README.md` if it indexes specs.
- **Test first:** no test (docs only).
- **Verify:** `ls specs/L03d-prompt-assembly-logging.md`
- **Depends on:** — · **Done when:** spec exists.

Section catalogue. Review: `system:agent` (trusted), `system:guard` (trusted, preview), `system:scope-rule` (trusted, preview, only with intent), `task` (untrusted), `pr-description`, `pr-intent`, `skill:<i>`, `memory` (trusted), `repo-map`, `spec:<i>`, `callers`, `diff`. Intent: `system:intent` (trusted, preview), `task` (trusted, constant), `pr-title`, `pr-description`, `branch`, `commits`, `issue:#N`, `doc:<path>`, `changed-files` (source `diff-headers`), `unavailable-sources`.

### S1 — Review prompt manifest  [package: reviewer-core · layer: reviewer-core]
- **Skills:** typescript-expert, security, test-strategy
- **Files:** create `reviewer-core/src/prompt-manifest.ts` (types `PromptSection`, `SectionMeter`, `PREVIEW_MAX_CHARS=200`, pure `measure(name, source, trust, text, meter, preview?)`). Modify `reviewer-core/src/prompt.ts:116-189` so `assemblePrompt(parts, meter?)` also returns `sections`, built alongside each `push` at `:127` and `:146-167`.
- **Test first:** `reviewer-core/test/prompt-manifest.test.ts`. Cases:
  - all slots → names, sources and trust as in the catalogue
  - each section has no key besides `name, source, trust, chars, tokens?, sha256?, preview?`, and `JSON.stringify(sections)` does not contain the diff text or PR body
  - Σchars equals `system.length + user.length` (joiners attributed to the preceding section)
  - meter supplied → `tokens`/`sha256` come from the injected functions; no meter → absent
  - `preview` only on `system:guard`/`system:scope-rule`, ≤ 200 chars
  - `messages` are byte-identical to before (the existing `prompt.test.ts` stays green)
- **Implement:** Collect `{name, source, trust, text}` while building. Never store `text` in the output.
- **Verify:** `cd reviewer-core && npm test && npm run typecheck`
- **Depends on:** S0 · **Done when:** AC1 (review part).

### S2 — Intent manifest and engine hook  [package: reviewer-core · layer: reviewer-core]
- **Skills:** typescript-expert, security, test-strategy
- **Files:** modify `reviewer-core/src/intent/prompt.ts:78-130` (accept `meter?`; return `sections` with the system message included; issue label `issue-#N` → source `issue:#N`, doc → `doc:<ref>`; keep `components`). Modify `reviewer-core/src/review/run.ts:45-102` (add `promptMeter?`, `onPromptAssembled?: (i: PromptAssembledInfo) => void` with `{sections, mode, chunk?:{index,total,file}}`) and `:184` (pass the meter and call the hook **before** `completeStructured` at `:186`; not for the trace-only assembly at `:154`; `chunk` only in map-reduce). Modify `reviewer-core/src/index.ts`: add-only exports.
- **Test first:**
  - extend `reviewer-core/test/intent-prompt.test.ts`: the issue section has source `issue:#471`, issue text is absent from `JSON.stringify(sections)`, and `system:intent` has a preview
  - extend `reviewer-core/test/run.test.ts`: single-pass → 1 call, no `chunk`; map-reduce with 3 files → 3 calls with `chunk.index` 0..2 and `total` 3; the hook fires before the fake LLM is invoked (record order)
- **Verify:** `cd reviewer-core && npm test && npm run typecheck && cd ../server && pnpm typecheck`
- **Depends on:** S1 · **Done when:** AC1, AC2.

### S3 — Verbose flag (local only)  [package: server · layer: platform]
- **Skills:** onion-architecture, fastify-best-practices, security, test-strategy
- **Files:** modify `server/src/platform/config.ts:15-41` (`PROMPT_LOG_VERBOSE: z.string().optional()`), `:43-66` (`promptLogVerbose: boolean`, `promptLogVerboseIgnored: boolean`) and `:73-85`. Modify `server/src/app.ts` after the Fastify construction at `:45-58`: `if (config.promptLogVerboseIgnored) app.log.warn('PROMPT_LOG_VERBOSE ignored in production')`. Modify `server/.env.example` (commented `PROMPT_LOG_VERBOSE=`) and the env table in `server/README.md:92-106`.
- **Test first:** `server/test/config-prompt-log.test.ts`. Cases:
  - unset → `false`/`false`
  - `1` + development → `true`
  - `1` + production → `false`, ignored `true`
  - `true`/`0` → `false` (only `'1'` enables)
- **Verify:** `cd server && pnpm exec vitest run test/config-prompt-log.test.ts && pnpm typecheck`
- **Depends on:** — · **Done when:** AC3.

### S4 — Redaction and event builder (pure)  [package: server · layer: platform]
- **Skills:** onion-architecture, security, test-strategy
- **Files:** create `server/src/platform/redact.ts` (`redactLogValue(s)`: URL → `host+path` like `sanitizeRef` at `server/src/modules/intent/helpers.ts:37-45`, but applied to URLs found inside any string; mask `sk-`/`sk_live_`/`sk_test_`, `ghp_`/`gho_`/`github_pat_`, `xox[bp]-`, `AKIA[0-9A-Z]{16}`, `Bearer <tok>`, and any `[A-Za-z0-9_\-]{40,}` run → `[redacted]`; must not touch UUIDs or 12-hex digests). Create `server/src/platform/prompt-log.ts` with:
  - `PROMPT_ASSEMBLED_MSG`
  - `buildPromptAssembledEvent(input, {verbose})`: input `{correlationId, runId?, prId, agent?, provider, model, promptKind, promptVersion?, mode?, chunk?, sections, diff?: UnifiedDiff, chunkFile?, skillBlocks?}`. Output sections `{name, source, trust, chars, tokens}` plus verbose `sha256` and `preview`; `totals`; `diffStats {files, additions, deletions, hunks}` (from `UnifiedDiff.files[].hunks.length`, `server/src/vendor/shared/adapters.ts:194-197`); verbose `diffFiles[]` (cap 200) and `skills[] {name, version, tokens}`; relabel `skill:<i>` → `skill:<name>`; deep-map every string through `redactLogValue`; immutable.
  - `promptSummaryLine(event)` → `"Prompt: 9 sections, ~12.3k tokens, model X"` (+ `" (chunk 2/5)"`)
  - `sha12(text)` (node:crypto) and `makeMeter(tokenizer, verbose)` with a per-run memo `Map`
- **Test first:** `server/test/prompt-log-helpers.test.ts`. Cases:
  - `redactLogValue('https://u:p@h.io/a?token=X#f')` → `h.io/a`
  - `sk_live_abc…` / `ghp_…` / `Bearer …` masked; a UUID is unchanged
  - verbose off → no `sha256`/`preview`/`diffFiles`/`skills`; verbose on → present
  - a section `source` containing a URL query is redacted
  - output never has a `text`/`content` key
  - summary line format
- **Verify:** `cd server && pnpm exec vitest run test/prompt-log-helpers.test.ts && pnpm typecheck`
- **Depends on:** S2 · **Done when:** AC4.

### S5 — `RunTrace.config.correlation_id`  [package: server + client · layer: contracts]
- **Skills:** shared-contracts, zod, test-strategy
- **Files:** modify `server/src/vendor/shared/contracts/trace.ts:97-104`. Then `cp` it to `client/src/vendor/shared/contracts/trace.ts`.
- **Test first:** extend `server/test/contracts.test.ts`: a trace without `correlation_id` parses; with `"abc"` it parses; with a number it fails.
- **Verify:** `cd server && pnpm exec vitest run test/contracts.test.ts && pnpm typecheck && diff src/vendor/shared/contracts/trace.ts ../client/src/vendor/shared/contracts/trace.ts && cd ../client && pnpm typecheck`
- **Depends on:** — · **Done when:** contract ready for S6.

### S6 — Review execution wiring  [package: server · layer: service]
- **Skills:** onion-architecture, fastify-best-practices, security, test-strategy
- **Files:**
  - `server/src/modules/reviews/run-executor.ts`:
    - `:99-115`: `const correlationId = randomUUID()` in `executeRuns`; add it to the `RunLogger` ctx and to `ExecCtx` (`:60`)
    - `:160`
    - `:177-195`: `logAgentStart`/`Done` + `correlationId`
    - `:262-287`: pass `promptMeter: makeMeter(this.container.tokenizer, cfg.promptLogVerbose)` and an `onPromptAssembled` that builds the event (agent, provider, model, `promptKind:'review'`, diff, `skillsPlan.blocks`) → `ctx.logger?.info(event, PROMPT_ASSEMBLED_MSG)` + `runLog.info(promptSummaryLine(event))`
    - `:349-356` and `:520-534`: `correlation_id` (thread it through `traceFromBuffer` and `failAll` `:133`)
    - `:153-156`: pass `{logger, correlationId}` to `forReview`
  - `server/src/modules/intent/service.ts:115-121`: accept an optional `obs` and forward it to `classify` (body in S7)
- **Test first:** create `server/test/prompt-logging.it.test.ts`, harness copied from `server/test/reviews-intent.it.test.ts:1-40` + `intent-mocks.ts`. Seed a PR with body `BODY-MARKER-TEXT`, a diff containing `stripeKey: "sk_live_xxx"`, and 2 agents. Run `new ReviewService(app.container).runReview(ws, prId, agents, capture)` + `waitForPrRuns`. Expect:
  - 2 `prompt.assembled` events with `promptKind:'review'`
  - all share one `correlationId`
  - `GET /runs/:id/trace` → `config.correlation_id` equals it
  - the stringified capture lacks every marker
- **Verify:** `cd server && pnpm exec vitest run test/prompt-logging.it.test.ts test/reviews.it.test.ts test/reviews-intent.it.test.ts && pnpm typecheck`
- **Depends on:** S4, S5 · **Done when:** AC5 (review part), AC7.

### S7 — Intent classification wiring and route `req.id`  [package: server · layer: service, route]
- **Skills:** onion-architecture, fastify-best-practices, security, test-strategy
- **Files:**
  - `server/src/modules/intent/service.ts`:
    - `:97-108`: `detect(ws, prId, logger?, correlationId = randomUUID())`
    - `:181-187`: `classify(..., log, obs: {logger?: PinoLike; correlationId: string})`
    - `:209-232`: pass the meter to `buildIntentMessages`; emit `prompt.assembled` (`promptKind:'intent'`, `promptVersion: INTENT_PROMPT_VERSION`) to `obs.logger`; add `correlationId` to the `intent: classifying` data; send the summary line through `log`
  - `server/src/modules/intent/routes.ts:36`: pass `req.log, req.id`
- **Test first:** extend `prompt-logging.it.test.ts`:
  - the review execution also has exactly 1 `promptKind:'intent'` event with the same `correlationId`
  - `new IntentService(app.container).detect(ws, prId, capture, 'req-42')` → event `correlationId:'req-42'`, a source `issue:#…`, no `ISSUE-SECRET-TEXT`/`URLQUERYSECRET`, following the pattern at `intent.it.test.ts:167-190`
- **Verify:** `cd server && pnpm exec vitest run test/prompt-logging.it.test.ts test/intent.it.test.ts && pnpm typecheck`
- **Depends on:** S6 · **Done when:** AC5, AC6, AC7.

### S8 — Insights and docs  [package: root · layer: docs]
- **Skills:** engineering-insights
- **Files:** `server/INSIGHTS.md` gets two new entries:
  - [Security] "`prompt.assembled` carries a manifest, never text; structured data must bypass `runLog` (it goes to SSE)", proof `run-logger.ts:54`
  - [Non-obvious behaviour] "`taskLine` embeds the PR title, so it is untrusted", proof `helpers.ts:87`

  `reviewer-core/INSIGHTS.md` gets an [Architectural decision] "meter injected, core stays crypto- and env-free". Add a public-API note to `reviewer-core/README.md`.
- **Test first:** no test (docs only).
- **Verify:** fact check that the cited lines exist (`git grep -n`).
- **Depends on:** S7 · **Done when:** insights recorded.

## Verification matrix
| Package | Commands |
|---|---|
| reviewer-core | `cd reviewer-core && npm run typecheck && npm test` |
| server | `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts' && pnpm exec vitest run test/prompt-logging.it.test.ts test/intent.it.test.ts test/reviews.it.test.ts test/reviews-intent.it.test.ts test/reviews-skills.it.test.ts` |
| client | `cd client && pnpm typecheck && pnpm test` (type-only mirror, so `build` is not needed) |
| mirror | `diff server/src/vendor/shared/contracts/trace.ts client/src/vendor/shared/contracts/trace.ts` prints nothing |

## Risks
| Risk | Likelihood | Mitigation in plan |
|---|---|---|
| Tokenizing every section of every chunk slows large map-reduce runs | M | `makeMeter` memoizes per run (S4). Only one count per distinct section text. |
| The structured event leaks into the Live Log/SSE via `runLog` | M | S6/S7 send it only to `logger`. The `.it` test also checks that the summary line has no markers. |
| The redaction regex masks legitimate IDs (UUIDs, short hashes) | L | Unit cases in S4 keep UUIDs and 12-hex digests unchanged. |
| The manifest diverges from the real prompt (Σchars mismatch) | L | The S1 invariant test ties Σchars to message length. |
| `forReview` swallows errors, hiding a logging bug | L | The `.it` test asserts that the intent event is present. |

## Out of scope
- Showing `correlation_id` in the client UI (RunTraceDrawer). The CI runner's logging (it can adopt `onPromptAssembled` later). Pino `redact` paths config. Persisting the manifest in the run trace. Note: `prompt_assembly` already stores the full prompt in the DB, which is not logging.
- For the security reviewer: completeness of the secret patterns in `redact.ts`, and whether `system:agent` (user-authored) should ever be previewable (this plan says no).

## Open questions
- `intent: classifying` keeps its `components` field only to keep `intent.it.test.ts:184` green. Should it be dropped in a follow-up once `prompt.assembled` is the canonical event?
- `.it` tests were not run during planning. These need Docker; the implementer should report them as "not run: <reason>" if Docker is unavailable.
