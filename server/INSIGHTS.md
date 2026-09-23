# Insights — server

Dated entries, newest first. Format and rubrics: [../.claude/skills/engineering-insights/SKILL.md](../.claude/skills/engineering-insights/SKILL.md).

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
