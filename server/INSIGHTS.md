# Insights — server

Dated entries, newest first. Format and rubrics: [../.claude/skills/engineering-insights/SKILL.md](../.claude/skills/engineering-insights/SKILL.md).

## 2026-09-30 — [Performance] Reasoning models are a bad default for structured LLM features
Symptom: a conventions scan with `deepseek/deepseek-v4-flash` used all 4 000 output tokens on hidden reasoning, returned empty content and timed out; `openai/gpt-4.1-mini` finished the same scan in 10 s with 12 grounded candidates.
Cause: reasoning tokens count against `max_tokens` and are produced before any visible answer.
Rule: default structured-output features (conventions, intent, risks) to non-reasoning models; if a reasoning model is chosen in Settings, raise `max_tokens` and expect minutes, not seconds.
Proof: `server/src/vendor/shared/contracts/platform.ts:77`, `server/src/modules/conventions/constants.ts:34`

## 2026-09-30 — [Architectural decision] One running conventions scan per repo via an advisory lock
Context: two quick clicks on Run Scan must not start two LLM jobs for the same repo.
Decision: `startScan` takes `pg_advisory_xact_lock(hashtext('convention_scan:<repo>'))` inside the insert transaction and returns 409 if a `running` scan exists; a scan stuck `running` for > 10 min is treated as stale.
Consequence: single-DB assumption (like the boot reaper); completion only updates a scan that is still `running`.
Proof: `server/src/modules/conventions/repository.ts:91`

## 2026-09-30 — [Non-obvious behaviour] `MockGitClient.readFile` returns `''` for missing files; the real client throws
Symptom: sampler code that relies on a throw to skip absent config files passes tests but behaves differently in dev.
Rule: treat both "empty" and "throws" as missing in code that probes optional files.
Proof: `server/src/adapters/mocks.ts:293`

## 2026-09-30 — [Pitfall] Running the "hermetic" unit suite used to fail live dev review runs
Symptom: a review started in the dev stack flips to `failed` with no error and no trace while `pnpm test` runs.
Cause: `routes-smoke.test.ts` calls `buildApp()` with the default `DATABASE_URL` (the dev DB), and the boot reaper marked every `running` agent_run there as failed.
Rule: the boot reaper is skipped under `NODE_ENV=test` (covered by `test/app-boot-reaper.test.ts`). Any new boot-time side effect that writes to the DB needs the same guard.
Proof: `server/src/app.ts:82`, `server/test/routes-smoke.test.ts:15`

## 2026-09-30 — [Security] A zip's declared sizes can lie — cap skill-import output while inflating
Context: imported archives are untrusted; a 205 KB zip whose `SKILL.md` claims 10 bytes can inflate to 200 MB.
Decision: pass 1 reads the central directory only (entry count ≤ 200, declared total ≤ 5 MB); pass 2 inflates just the chosen markdown entry with fflate's streaming `Unzip`, fed 4 KB at a time, and stops as soon as output passes 80 KB. Everything else is listed as ignored and never inflated or stored.
Consequence: never go back to `unzipSync` — with a lying header it silently truncates (no error) or burns CPU on the event loop; `terminate()` is a no-op on the sync inflater, so "stop feeding" is the only real abort.
Proof: `server/src/modules/skills/import.ts:102`, `server/src/modules/skills/constants.ts:19`

## 2026-09-30 — [Pitfall] Increment `skills.version` in SQL, and map only the name index to 409
Symptom: two concurrent saves of one skill answered 200 / 409 "name already exists" / 200.
Cause: the service computed `version + 1` from an earlier read, so both writers inserted the same `skill_versions` key; the unique-violation handler treated every 23505 as a name clash.
Rule: bump with `version = version + 1 … RETURNING` inside the repository transaction and snapshot at the returned version; check `constraint_name === 'skills_workspace_name_uq'` before answering 409.
Proof: `server/src/modules/skills/repository.ts:162`, `server/src/modules/skills/helpers.ts:87`

## 2026-09-30 — [Security] Skill bodies are hardened before they enter the prompt
Context: skills are instructions by design, but imported ones come from third-party files and land verbatim under `## Skills / rules`.
Decision: headings in a body are demoted three levels (max 6, fenced code untouched) so they nest under `### Skill: …`, and `<untrusted`/`</untrusted` look-alikes are escaped so a body cannot fake the prompt's data delimiters.
Consequence: keep `hardenSkillBody` on every path that injects skills (e.g. a future CI runner).
Proof: `server/src/modules/reviews/skills-prompt.ts:59`

## 2026-09-29 — [Non-obvious behaviour] Skill import routes need their own `bodyLimit`
Symptom: a ~1 MB `.zip` upload is rejected with 413 although the upload limit is 1 MB.
Cause: the app-wide `bodyLimit` is 1 MiB and the file travels base64-encoded in JSON (×4/3).
Rule: routes that accept base64 files set `bodyLimit: IMPORT_BODY_LIMIT` per route; don't raise the global cap.
Proof: `server/src/app.ts:49`, `server/src/modules/skills/constants.ts:16`

## 2026-09-29 — [Non-obvious behaviour] `skills_tokens` is counted on the joined section, not summed per skill
Symptom: summing each skill block's tokens gives a slightly different number than the trace total.
Cause: reviewer-core joins skill texts with a blank line before inserting them, so the section the model sees has separators the per-block counts omit.
Rule: count the total with the same joiner (`buildSkillsPrompt` does); per-block counts are for attribution only.
Proof: `reviewer-core/src/prompt.ts:89`, `server/src/modules/reviews/skills-prompt.ts:54`

## 2026-09-29 — [Pitfall] DB-backed tests silently skip when `docker info` is slow
Symptom: `*.it.test.ts` reported as skipped (not failed) on a loaded machine although Docker was running.
Cause: `dockerAvailable()` shells out to `docker info` with a 5 s timeout and caches `false` on timeout.
Rule: a green run with skipped it-tests is not a pass — check the skip count and re-run when the machine is idle.
Proof: `server/test/helpers/pg.ts:33`

## 2026-09-29 — [Non-obvious behaviour] Four route files bypass the service layer — do not copy them
Symptom: an agent asked to "do what pulls/routes.ts does" puts `container.db` / `container.github()` calls in a handler.
Cause: `pulls`, `polling`, `settings` and `workspace` routes predate the route → service → repository split that `agents`, `repos` and `reviews` follow.
Rule: copy `modules/agents|repos|reviews`; new logic in a legacy route goes into a new service. See `.claude/skills/onion-architecture/SKILL.md`.
Proof: `server/src/modules/pulls/routes.ts:30`, `server/src/modules/settings/routes.ts:30`, `server/src/modules/agents/routes.ts:75`

## 2026-09-19 — [Architectural decision] One severity rule for PR list and agent cards
Context: two screens count "findings" and would drift if each had its own SQL.
Decision: `reviews/severity.ts` holds the pure rule (`countActiveFindings` per PR, `countActiveFindingsForAgent` per agent, newest review per bucket, dismissed excluded); routes only fetch lite rows and group in JS.
Consequence: `GET /repos/:id/pulls` and `GET /agents` each run two extra IN-queries over reviews + findings (only `severity`, `dismissed_at`, `review_id` selected); acceptable for a workspace-sized list, revisit with an index on `findings(review_id, dismissed_at)` if it grows.
Proof: `server/src/modules/reviews/severity.ts:83`, `server/src/modules/pulls/routes.ts:135`, `server/src/modules/agents/service.ts:75`

## 2026-09-17 — [Pitfall] Testcontainers cannot publish ports on this machine; use `TEST_DATABASE_URL`
Symptom: every `*.it.test.ts` fails with "No host port found for host IP" although `docker run -p` works.
Cause: Docker Desktop 4.42 returns an empty `NetworkSettings.Ports` for containers created by testcontainers 10.28 (verified with a bare `GenericContainer('nginx:alpine')`); the DB never gets a host port.
Rule: run each integration file against a fresh throwaway DB: `TEST_DATABASE_URL=postgres://devdigest:devdigest@localhost:5432/devdigest_it pnpm exec vitest run test/<file>.it.test.ts` (create/drop `devdigest_it` between files). CI still uses Testcontainers.
Proof: `server/test/helpers/pg.ts:42`, `server/node_modules/testcontainers/build/utils/bound-ports.js:63`

## 2026-09-17 — [Non-obvious behaviour] `RunStats.cost_usd` must stay optional
Symptom: making the new trace key required looks cleaner but would break every run persisted before L01.
Cause: `run_traces.trace` is stored jsonb and the trace route serialises the document through `RunTrace`; old documents have no `cost_usd` key.
Rule: new keys on `RunStats`/`RunTrace` are `nullish()`; new keys on DB-row DTOs (`RunSummary`, `ReviewRecord`) can be `nullable()` because the column exists after migration.
Proof: `server/src/vendor/shared/contracts/trace.ts:68`, `server/src/modules/reviews/routes.ts:121`

## 2026-09-17 — [Non-obvious behaviour] `POST /pulls/:id/review { all: true }` in tests leaves runs unfinished
Symptom: `waitForPrRuns` times out after "run all"; zero runs reach `done`.
Cause: seeded agents use providers the test app does not mock, so their runs never settle inside the helper's 10s window; only the single-agent path is deterministic with `MockLLMProvider`.
Rule: assert cost/outcome on single-agent runs; keep the run-all test to a count check.
Proof: `server/test/reviews.it.test.ts:329`, `server/test/helpers/runs.ts:19`

## 2026-09-17 — [Non-obvious behaviour] The engine already returns `costUsd`; the executor drops it
Symptom: no cost anywhere in the UI or DB although OpenRouter/price-book cost attribution exists.
Cause: `run-executor` destructures only `tokensIn`, `tokensOut`, `grounding` from the engine outcome; `agent_runs` has no cost column and no contract carries the field.
Rule: when surfacing cost (spec `specs/L01-run-cost.md`), wire the existing `outcome.costUsd` through — do not recompute prices in the server.
Proof: `server/src/modules/reviews/run-executor.ts:213`, `reviewer-core/src/review/run.ts:110`, `server/src/db/schema/runs.ts:18`

## 2026-09-17 — [Non-obvious behaviour] `MockLLMProvider` reports a fixed `costUsd: 0.001` per call
Symptom: integration assertions on cost see multiples of 0.001, not a realistic price.
Cause: the mock hard-codes `costUsd: 0.001` in both completion paths.
Rule: in `*.it.test.ts`, assert cost as `0.001 × calls` (or `> 0`), never against a price table.
Proof: `server/src/adapters/mocks.ts:85`, `server/src/adapters/mocks.ts:101`

## 2026-09-17 — [Pitfall] `relation ... does not exist` on first run
Symptom: API errors immediately after clone or after pulling schema changes.
Cause: the server boots straight to `listen`; it never calls `migrate`.
Rule: run `pnpm db:migrate` after every schema change; do not add auto-migrate on boot.
Proof: `server/src/server.ts:29`, `server/src/db/migrate.ts:30`

## 2026-09-17 — [Non-obvious behaviour] pgvector is enabled by `migrate.ts`, not by migration `0000`
Symptom: README says migration `0000` enables the `vector` extension; the SQL file contains no `CREATE EXTENSION`.
Cause: `migrate.ts` ensures the extension before applying migrations; `0000_init.sql` only declares `vector(1536)` columns.
Rule: always migrate through `pnpm db:migrate`, never by piping SQL files into psql; keep `DATABASE_URL` on the Dockerized DB.
Proof: `server/src/db/migrate.ts:13`, `server/src/db/migrations/0000_init.sql:75`

## 2026-09-17 — [Non-obvious behaviour] Server tests live in `server/test/`, not next to the code
Symptom: searching `src/` for `*.test.ts` finds nothing.
Cause: all server suites sit in `server/test/`; DB-backed ones end in `.it.test.ts` and use `test/helpers/pg.ts`.
Rule: add new server tests under `server/test/`; name DB-backed ones `*.it.test.ts`.
Proof: `server/test/reviews.it.test.ts:13`, `server/test/helpers/pg.ts:10`

## 2026-09-17 — [Pitfall] Integration tests silently skip without Docker
Symptom: `*.it.test.ts` show as skipped locally but fail in CI.
Cause: each file gates on `dockerAvailable()` and swaps `describe` for `describe.skip`.
Rule: start Docker before trusting a green integration run; check for "skipped" in the vitest summary.
Proof: `server/test/repo-intel-symbol-clamp.it.test.ts:17`, `server/test/helpers/pg.ts:10`

## 2026-09-17 — [Architectural decision] Orphaned runs are reaped on boot, assuming one API instance
Context: a process that dies mid-review leaves `running` rows the UI can never cancel.
Decision: before `listen`, every `running` run is reaped; no heartbeats or per-instance scoping.
Consequence: correct for a single API instance per DB; multiple replicas would reap each other's live runs.
Proof: `server/src/app.ts:70`

## 2026-09-17 — [Security] Rate limits are layered: global 120/min plus per-route caps
Symptom: a load test on `POST /pulls/:id/review` gets 429 well before 120 requests.
Cause: the global limiter is registered in `app.ts`; expensive routes add tighter `config.rateLimit` (10/min review, 20/min settings). Global limit is off under `NODE_ENV=test`.
Rule: when adding an LLM-calling route, set a per-route cap; do not relax the global one.
Proof: `server/src/app.ts:96`, `server/src/modules/reviews/routes.ts:29`, `server/src/modules/settings/routes.ts:72`

## 2026-09-17 — [Security] `GITHUB_TOKEN` is canonical; `GITHUB_PAT` is a silent fallback
Symptom: a token set as `GITHUB_PAT` works, but the Settings UI and docs only mention `GITHUB_TOKEN`.
Cause: `LocalSecretsProvider` reads `GITHUB_TOKEN ?? GITHUB_PAT` for back-compat.
Rule: document and set `GITHUB_TOKEN`; never read tokens outside `adapters/secrets/`.
Proof: `server/src/adapters/secrets/local.ts:40`

## 2026-09-17 — [Performance] Studio reviews are single-pass by design
Symptom: map-reduce looks like it should handle big diffs better.
Cause: map-reduce issues one LLM call per file; one transient 5xx fails the whole run, and it is slower for typical PRs.
Rule: keep `'single-pass'` as the studio default; map-reduce is opt-in above the map threshold.
Proof: `server/src/modules/reviews/constants.ts:5`

## 2026-09-17 — [Non-obvious behaviour] Repo-intel context degrades silently, never fails a review
Symptom: a review on an unindexed repo returns findings with no repo-map section in the prompt.
Cause: `run-executor` builds the repo map only when `repoIntelOn` and passes it as an optional prompt part.
Rule: when adding prompt slots, keep them optional and omit them when the source is not ready.
Proof: `server/src/modules/reviews/run-executor.ts:181`, `server/src/modules/reviews/run-executor.ts:202`, `server/src/platform/config.ts:24`
