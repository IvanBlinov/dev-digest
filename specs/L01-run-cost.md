# L01 — Run cost on three screens

Status: **implemented on branch `feat/l01-run-cost` (2026-09-17)**; browser e2e not run locally (agent-browser not installed). Plan: [L01-run-cost-plan.md](L01-run-cost-plan.md).

## Goal

Show how much money each AI review costs, in USD, on the three places a user already looks at
runs: the pull-request list, the run header on the PR page, and the run trace drawer. The number
already exists — `reviewPullRequest` returns `costUsd` for every run (live OpenRouter prices or
the static price table) — but the server drops it before persistence and no contract carries it.

## Scope

**In**
- Persist `cost_usd` per agent run.
- Expose it on `RunSummary`, `RunStats`, `ReviewRecord`, and as a per-PR total on `PrMeta`.
- Render it on three screens (below).
- Unit + integration + component tests; one e2e assertion on the new column header.

**Out** (explicitly, for this lesson)
- Sorting or filtering the PR list by cost.
- Cost budgets, alerts, per-agent dashboards (L08), CI payload cost (already has its own field).
- Back-filling cost for runs that finished before the migration — they show "—".
- Any change to how the price is computed (`PriceBook`, `pricing.ts`, OpenRouter `usage.cost`).

## Decisions (agreed 2026-09-17)

| Question | Decision |
|----------|----------|
| PR-list cost meaning | **Sum of all `done` runs of that PR**, across agents. |
| Unknown cost | Render **"—"**, same as an absent score. No `$0.00`. |
| Storage | **New migration**: `agent_runs.cost_usd double precision NULL`. |
| Sort / filter | **None** in this feature. |
| Partial knowledge | If some runs of a PR have `null` cost and others a number, the total is the sum of the known ones. Total is `null` only when no `done` run has a cost. |
| Failed / cancelled runs | `cost_usd = null` (the engine threw; per-call costs are not surfaced). Excluded from the PR total by the `status = 'done'` filter. |
| Formatting | `formatUsd(v)`: `null` → `—`; `v < 1` → `$` + 4 decimals (`$0.0123`); else `$` + 2 decimals (`$1.27`). Monospace, muted colour, right-aligned where it sits in a column. |
| Live runs | While `status = 'running'`, the run header and timeline show nothing for cost (field is `null` until completion). |

## Screens

### 1. Pull-request list — `/repos/:repoId/pulls`

New column **Cost** between **Score** and **Status**. Header key `list.columns.cost` = "Cost".
Cell: `formatUsd(pr.cost_usd)`. Width 74px added to the grid template.

### 2. Run header on the PR page — `ReviewRunAccordion` (+ `RunHistory` row)

In the accordion header, right after the score badge and before the time (`formatWhen`), a
monospace muted `formatUsd(review.cost_usd)`. Hidden entirely when `null` (the header is already
dense; "—" adds noise). The timeline row in `RunHistory` shows the same value under the run time
in its right-hand column, same rule.

### 3. Run trace drawer — `TraceBody` stats row

Fourth `Stat` after Duration / Tokens / Findings: label `trace.stat.cost` = "COST", value
`formatUsd(stats.cost_usd)`.

## Contracts (`@devdigest/shared`, server copy first, client mirror same commit)

```ts
// contracts/trace.ts
RunStats:    cost_usd: z.number().nullish()           // optional key: pre-L01 traces lack it
RunSummary:  cost_usd: z.number().nullable()
// contracts/review-api.ts
ReviewRecord: cost_usd: z.number().nullable()        // from agent_runs via review.run_id
// contracts/platform.ts
PrMeta:      cost_usd: z.number().nullish()          // list endpoint only; sum of done runs
```

`RunStats.cost_usd` is `nullish()` (decided at implementation): trace documents persisted before
L01 have no key, and the trace route serialises through the same schema, so a required key would
500 on every old run. New traces always write the key (a number or `null`).

## Data flow

```
reviewer-core reviewPullRequest → outcome.costUsd (already summed over chunks/retries)
  └─ server run-executor
       ├─ completeAgentRun(runId, { …, costUsd })        → agent_runs.cost_usd
       └─ trace.stats.cost_usd                            → run_traces.trace
server reads
  ├─ run.repo listRuns          → RunSummary.cost_usd
  ├─ reviews listing (join runs)→ ReviewRecord.cost_usd
  └─ pulls list route           → PrMeta.cost_usd = SUM(agent_runs.cost_usd) WHERE status='done' GROUP BY pr_id
client
  ├─ PRRow                      → formatUsd(pr.cost_usd)
  ├─ ReviewRunAccordion, RunHistory → formatUsd(review/run.cost_usd)
  └─ TraceBody                  → formatUsd(trace.stats.cost_usd)
```

## Per-package work

- **reviewer-core**: no code change. Add one assertion that `costUsd` sums across map-reduce chunks (guards the value the whole feature depends on).
- **server**: schema + migration; `completeAgentRun` signature; run-executor (done path passes cost, failed path passes `null`, `traceFromBuffer` sets `cost_usd: null`); `run.repo` mapping; reviews listing join; pulls list aggregate + pure helper `sumRunCosts` in `modules/pulls/status.ts`; contracts.
- **client**: mirror contracts; `src/lib/format-usd.ts`; PR list (constants `GRID`, `COLUMN_KEYS`, i18n, `PRRow`); `ReviewRunAccordion`; `RunHistory`; `TraceBody` + `runs.json`.
- **e2e**: flow 02 gains `wait --text "Cost"` on the list header.

## Acceptance criteria

- [x] A completed review run stores a non-null `cost_usd` when the provider reports usage (integration test with `MockLLMProvider`, which returns `costUsd: 0.001` per call).
- [x] A failed run stores `cost_usd = null`.
- [x] `GET /repos/:id/pulls` returns `cost_usd` per PR equal to the sum of its `done` runs; `null` when no priced run exists.
- [x] `GET /pulls/:id/runs` (RunSummary) and the reviews listing return `cost_usd`.
- [x] `GET /runs/:id/trace` returns `stats.cost_usd`; a trace persisted before the change still parses.
- [x] PR list shows a **Cost** column; rows render `$0.0123` / `$1.27` / `—` per the formatting rule.
- [x] Accordion header and timeline row show the cost when known, nothing when `null`.
- [x] Trace drawer stats row shows a fourth COST stat.
- [x] All four packages typecheck; server unit + integration (via `TEST_DATABASE_URL`), client, reviewer-core suites green.
- [ ] e2e flow 02 on the hermetic stack — **not run**: `agent-browser` is not installed on this machine.
- [x] The four L01 contract edits are identical in both `vendor/shared` copies (the copies had unrelated pre-existing drift; see `client/INSIGHTS.md`).

## Links

- Engine cost source: `reviewer-core/src/review/run.ts:159`, `reviewer-core/src/review/run.ts:184`, `reviewer-core/src/llm/openrouter.ts:97`
- Cost dropped today: `server/src/modules/reviews/run-executor.ts:213` (destructures only tokens/grounding)
- Price sources: `server/src/platform/price-book.ts`, `server/src/adapters/llm/pricing.ts`
- Do-not-touch rules for migrations and lock files: [../CLAUDE.md](../CLAUDE.md)
- Insights to read first: [../server/INSIGHTS.md](../server/INSIGHTS.md), [../client/INSIGHTS.md](../client/INSIGHTS.md)
