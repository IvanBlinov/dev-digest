# L01 — Run cost: implementation plan

Spec: [L01-run-cost.md](L01-run-cost.md). Order matters: contracts → server → client → e2e.
Each step is TDD: write the test, watch it fail, implement, watch it pass, typecheck.

Check commands after every step in a package: `pnpm typecheck` (server/client) or
`npm run typecheck` (reviewer-core/e2e), plus that package's tests.

---

## Step 0 — Guard the source value (reviewer-core, ~10 min)

**Test** `reviewer-core/test/run.test.ts`: extend the existing map-reduce case (or add one) so a
stubbed `LLMProvider` returns `costUsd: 0.002` per call and the assertion reads
`expect(outcome.costUsd).toBeCloseTo(0.002 * calls)`. Add a second case where one call returns
`costUsd: null` → `outcome.costUsd === null`.

**Implement**: nothing expected; `run.ts:159–184` already sums. If the null case fails, fix there.

---

## Step 1 — Contracts (server copy, ~15 min)

Files: `server/src/vendor/shared/contracts/trace.ts`, `review-api.ts`, `platform.ts`.

- `RunStats`: add `cost_usd: z.number().nullable()`.
- `RunSummary`: add `cost_usd: z.number().nullable()`.
- `ReviewRecord`: add `cost_usd: z.number().nullable()`.
- `PrMeta`: add `cost_usd: z.number().nullish()` with a comment "list endpoint only; sum of done runs".

**Test** `server/test/contracts.test.ts`: `RunStats.parse({...withoutCost})` must **fail** and
with `cost_usd: null` must pass. Note the result: if pre-existing traces in the DB break the
trace route (Step 4 integration test), downgrade to `nullish()` and record the reason in
`server/INSIGHTS.md`.

Do **not** touch the client mirror yet (Step 6) so server typecheck proves the server compiles
on its own.

---

## Step 2 — Schema + migration (server, ~10 min)

- `server/src/db/schema/runs.ts`: add `costUsd: doublePrecision('cost_usd')` to `agentRuns`
  (import `doublePrecision` from `drizzle-orm/pg-core`), with a docblock: "USD, null = unknown
  (provider/model unpriced, failed run, or pre-migration)".
- `cd server && pnpm db:generate` → new `NNNN_<name>.sql` + snapshot + journal entry. **Do not
  edit existing migrations.** Inspect the generated SQL: exactly one `ALTER TABLE "agent_runs"
  ADD COLUMN "cost_usd" double precision;`.
- `pnpm db:migrate` locally.

**Test**: the existing `server/test/integration.it.test.ts` "migrations applied: every table
exists" keeps passing; add an assertion that `agent_runs` has column `cost_usd`.

---

## Step 3 — Persist the value (server, ~25 min)

Files: `server/src/modules/reviews/repository/run.repo.ts`,
`server/src/modules/reviews/run-executor.ts`.

- `completeAgentRun` values: add `costUsd: number | null` (required in the type so no call site
  forgets it). Write `costUsd: values.costUsd` in `.set({...})`.
- `listRuns` mapping (`run.repo.ts:52–67`): add `cost_usd: run.costUsd`.
- `run-executor.ts:213`: destructure `costUsd` from `outcome`; pass to `completeAgentRun`
  (`:243`); add `cost_usd: costUsd` to `trace.stats` (`:264`).
- Failed/cancelled path (`:297`): `costUsd: null`. `traceFromBuffer` (`:424`): `cost_usd: null`.
- Reviews listing: `reviewToDto` in `server/src/modules/reviews/helpers.ts:55` builds
  `ReviewRecord`. Add a `costUsd?: number | null` parameter (after `agentName`) and map
  `cost_usd: costUsd ?? null`; at its call sites in `service.ts`, left-join `agentRuns` on
  `reviews.runId` (same pattern as the `agents` join in `run.repo.ts:45`) and pass the value.
  Note there are **two** `completeAgentRun` call sites in `run-executor.ts` (`:78` multi-agent
  fan-out, `:243` single run) — both need `costUsd`.

**Tests**
- `server/test/reviews.it.test.ts` "runs a review…" (`:160`): after the run, assert the
  `RunSummary` for that run has `cost_usd` equal to `0.001 × <number of LLM calls>` (the
  `MockLLMProvider` returns `0.001` per call — count calls from the trace `tool_calls` length or
  assert `> 0` if retries make the count non-deterministic). Assert `trace.stats.cost_usd`
  equals the same number and that the reviews listing carries it.
- Add a failed-run case (force the mock to throw) asserting `cost_usd === null`.
- Hermetic: `server/test/reviews-helpers.test.ts` or a new `run-executor.test.ts` is not
  required; the integration test covers the wiring.

---

## Step 4 — PR-list total (server, ~20 min)

Files: `server/src/modules/pulls/status.ts`, `server/src/modules/pulls/routes.ts`.

- Pure helper in `status.ts`:
  ```ts
  /** Sum of known costs; null when no run carries one. */
  export function sumRunCosts(rows: { costUsd: number | null }[]): number | null
  ```
- In `GET /repos/:id/pulls` (`routes.ts:120–158`): one query
  `select prId, costUsd from agent_runs where pr_id in (...) and status = 'done'`, group in JS
  by `prId` via `sumRunCosts`, add `cost_usd` to the mapped row (`null` when the PR has no rows).

**Tests**
- `server/test/pulls-status.test.ts`: `sumRunCosts([])` → `null`; all-null → `null`; mixed
  `[0.1, null, 0.2]` → `0.3` (use `toBeCloseTo`).
- `server/test/reviews.it.test.ts`: after two runs on the seeded PR, `GET /repos/:id/pulls`
  returns `cost_usd` equal to their sum; a PR with no runs returns `null`.

---

## Step 5 — Formatting helper (client, ~10 min)

- `client/src/lib/format-usd.ts`:
  ```ts
  export function formatUsd(v: number | null | undefined): string
  ```
  `null/undefined` → `"—"`; `v < 1` → `$${v.toFixed(4)}`; else `$${v.toFixed(2)}`.
- **Test** `client/src/lib/format-usd.test.ts`: `null → —`, `0 → $0.0000`, `0.01234 → $0.0123`,
  `1.266 → $1.27`.

---

## Step 6 — Client contracts mirror (client, ~5 min)

Copy the four contract edits from Step 1 into `client/src/vendor/shared/contracts/*` verbatim.
Verify with `diff -r server/src/vendor/shared client/src/vendor/shared` → empty. `pnpm typecheck`.

---

## Step 7 — Screen 1: PR list column (client, ~25 min)

Files: `client/src/app/repos/[repoId]/pulls/constants.ts` (`GRID` at `:36`, `COLUMN_KEYS` at `:42`),
`_components/PRRow/PRRow.tsx`, `styles.ts` (only if a new cell style is needed),
`client/messages/en/prReview.json`.

- `GRID`: `"1fr 132px 92px 60px 74px 118px 78px"` (insert `74px` after score).
- `COLUMN_KEYS` (`constants.ts:42`): insert `"cost"` after `"score"`.
- i18n `list.columns.cost: "Cost"`.
- `PRRow`: new cell after the score cell: `<span className="mono" style={s.muted}>{formatUsd(pr.cost_usd)}</span>`
  (reuse `s.muted`; add `s.costCell` with `textAlign: "right"` if alignment is off).

**Test** `PRRow.test.tsx` (create if absent, pattern from `AgentCard.test.tsx`):
renders `$0.0123` for `cost_usd: 0.0123`, `—` for `null`; header test in the page-level test
(if one exists) asserts the "Cost" header is present.

---

## Step 8 — Screen 2: run header + timeline (client, ~20 min)

Files: `ReviewRunAccordion.tsx` (`:100–107`), `RunHistory.tsx` (`:190–192`).

- Accordion header: between the score badge and `formatWhen(...)`, when `review.cost_usd != null`:
  `<span className="mono" style={{ fontSize: 12, color: "var(--text-muted)" }}>{formatUsd(review.cost_usd)}</span>`.
- Timeline row right column: under the `ran_at` time, same conditional span.

**Tests**
- `RunHistory.test.tsx`: extend the fixture `run()` with `cost_usd: null`; new cases "shows the
  cost when known" (`cost_usd: 0.0042` → text `$0.0042`) and "shows no cost when null" (no `$`
  text).
- `ReviewRunAccordion.test.tsx` (create if absent): same two cases with a `ReviewRecord` fixture.

---

## Step 9 — Screen 3: trace stats (client, ~10 min)

Files: `RunTraceDrawer/_components/TraceBody/TraceBody.tsx` (`:63–67`), `client/messages/en/runs.json`
(`trace.stat.cost: "COST"`).

- Fourth `<Stat label={t("trace.stat.cost")} val={formatUsd(stats.cost_usd)} />`.

**Test** `RunTraceDrawer.test.tsx`: add `cost_usd: 0.0187` to the `TRACE.stats` fixture; the
"renders the trace tabs and stats" case asserts `COST` and `$0.0187` are on screen.

---

## Step 10 — e2e (~10 min)

`e2e/specs/02-repo-pulls-detail.flow.json`: after "land on the PR list", add
`{ "cmd": ["wait", "--text", "Cost"], "label": "cost column header is visible" }`.
Seeded data has no agent runs, so cells show "—"; do not assert a dollar value.
Run `npm run e2e:hermetic`.

---

## Step 11 — Docs + insights (~10 min)

- `client/README.md` route map: mention the Cost column in the PR list line.
- `server/README.md` API map: `PrMeta.cost_usd` note under `/repos/:id/pulls`.
- Record insights per `.claude/skills/engineering-insights/SKILL.md`. Already known candidates:
  - server, Non-obvious behaviour: the engine computed `costUsd` all along; the executor dropped it (`run-executor.ts:213`).
  - server, Non-obvious behaviour: `MockLLMProvider` returns a fixed `costUsd: 0.001` per call (`adapters/mocks.ts:85`) — integration assertions must count calls.
  - Whatever Step 1 reveals about `nullable` vs `nullish` on old trace documents.

---

## Definition of done

All acceptance criteria in the spec checked; `diff -r` of the two `vendor/shared` copies is
empty; every package's typecheck and tests green; hermetic e2e green; one commit per step or one
squashed `feat(cost): …` commit — conventional-commit format either way.

## Risks

- **Old trace documents** failing `RunStats` parsing if the key is `nullable()` (Step 1 test decides).
- **Grid widths**: the PR list uses fixed pixel columns; check at 1280px that the title column does not collapse.
- **Map-reduce retries**: the mock call count may vary; assert `> 0` and equality against `tool_calls.length × 0.001` only if stable.
