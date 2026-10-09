# Development Plan: Intent scope filter hardening (fix A + C)

**Spec:** `specs/L03-intent-layer.md` (amended in S5) · **Base commit:** `78bcfbf`
**Packages:** reviewer-core, server (+ docs) · **Size:** M (6 steps)

## Goal
The out-of-scope filter must never remove a serious defect, and a PR author must not be able to
switch the filter on with description text alone. Replaces user decisions D6/D7 of
`specs/plans/2026-10-08-intent-layer.md` (one cross-agent out-of-scope signal).

- **A — serious findings are never dropped.** A finding tagged `scope: 'out'` that is `CRITICAL`,
  or `WARNING` with `category: 'security'`, is always kept (all of them, from every agent), still
  tagged `out` so the client shows the "Outside PR scope" badge. Only non-serious out-of-scope
  findings are dropped. The cross-agent single-signal pick and the two-phase executor are removed:
  with nothing serious dropped, they have no job.
- **C — filter needs fetched evidence.** The filter turns on only when the stored intent is fresh,
  confidence ≠ `low`, **and** at least one explicit source (`issue`, `spec` or `plan`) has status
  `ok`. A description alone (any length) leaves intent as prompt context only.

## Acceptance criteria
- AC1 — With the filter on, every out-of-scope CRITICAL and security WARNING finding of every agent
  is persisted with `scope='out'`; out-of-scope SUGGESTIONs and non-security WARNINGs are dropped
  with a reason → `reviewer-core/test/scope.test.ts`, `server/test/reviews-intent.it.test.ts`.
- AC2 — The score is computed from the kept set (including kept out-of-scope serious findings) →
  `reviewer-core/test/run.test.ts`.
- AC3 — Fresh intent, confidence `medium`/`high`, sources only `pr_title`/`pr_body`/`branch`/
  `commits`/`files` (no ok issue/spec/plan) → filter off, log says why → `reviews-intent.it.test.ts`.
- AC4 — Same with one ok `issue` source → filter on → `reviews-intent.it.test.ts`.
- AC5 — Runs complete independently again (no waiting for other agents): no
  `runWithScopeSignal`, no `scope-signal.ts`; existing concurrency tests stay green →
  `server/test/reviews-concurrency.test.ts`, `server/test/reviews.it.test.ts`.
- AC6 — Every package typechecks; no removed `reviewer-core/src/index.ts` export is still imported
  anywhere (`git grep`).

## Key constraints
| Source | Rule | Effect |
|---|---|---|
| `AGENTS.md` Do not touch | `reviewer-core/src/index.ts` exports must not break the server | Remove only the scope-signal exports added in `78bcfbf` (unmerged) after `git grep` shows no consumer |
| `reviewer-core/src/prompt.ts:34-39` `SCOPE_RULE` | Already says scope never changes severity | Unchanged |
| `server/src/modules/intent/service.ts:131` | `scopeFilter = !stale && confidence !== 'low'` | Add the ok-explicit-source condition (C) |
| `specs/plans/README.md` | Plans are not edited after implementation starts | Do not edit `2026-10-08-intent-layer.md`; amend the spec instead |

## Steps
### S1 — reviewer-core: keep serious out-of-scope findings  [reviewer-core]
- **Skills:** typescript-expert, security, test-strategy, engineering-insights
- **Files:** modify `reviewer-core/src/review/scope.ts`, `reviewer-core/src/review/run.ts`,
  `reviewer-core/src/index.ts`; tests `reviewer-core/test/scope.test.ts`, `reviewer-core/test/run.test.ts`.
- **Test first:** `scope.test.ts` — disabled → all kept; `in`/null → kept; out CRITICAL ×2 + out
  security WARNING → all three kept (still `scope:'out'`); out non-security WARNING + out
  SUGGESTION → dropped with reason `out of PR scope`. `run.test.ts` — with intent + filter: two out
  CRITICALs both in `review.findings`, score from kept set, out SUGGESTION in `scopeDropped`.
- **Implement:** `partitionByScope(findings, {enabled})` → `{kept, dropped}`; rename
  `isScopeSignalEligible` → `isProtectedFromScopeFilter`. Remove `candidate`, `ScopeCandidate`,
  `compareScopeSignal`, `pickScopeSignal`, `withScopeSignal` and `ReviewOutcome.scopeCandidate`.
  Event line: `Scope filter: kept N in-scope, kept M out-of-scope (serious), dropped K out-of-scope`.
- **Verify:** `cd reviewer-core && npm run typecheck && npm test`
- **Depends on:** — · **Done when:** AC1, AC2 at engine level.

### S2 — server: single-phase executor again  [server · service]
- **Skills:** onion-architecture, fastify-best-practices, test-strategy, engineering-insights
- **Files:** modify `server/src/modules/reviews/run-executor.ts` (drop `runWithScopeSignal`, the
  waiting/decision lines and the `signal` parameter of `finalizeAgent`; every run uses the
  compute → finalize path that `scopeFilter=false` uses today); delete
  `server/src/modules/reviews/scope-signal.ts`, `server/test/reviews-scope-signal.test.ts`,
  `server/test/reviews-scope-signal.it.test.ts`.
- **Test first:** move the still-relevant cases of `reviews-scope-signal.it.test.ts` into
  `reviews-intent.it.test.ts`: two agents each returning an out-of-scope CRITICAL → both persisted
  with `scope='out'`; an out-of-scope non-security WARNING → not persisted.
- **Verify:** `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'`
- **Depends on:** S1 · **Done when:** AC5.

### S3 — server: filter needs a fetched explicit source (C)  [server · service]
- **Skills:** onion-architecture, security, test-strategy, engineering-insights
- **Files:** modify `server/src/modules/intent/service.ts` (`forReview`), optionally a pure helper
  `hasFetchedExplicitSource(sources)` in `server/src/modules/intent/helpers.ts`;
  tests `server/test/intent-helpers.test.ts`, `server/test/reviews-intent.it.test.ts`.
- **Test first:** helper — only `pr_body ok` → false; `issue ok` → true; `spec not_found` → false.
  `.it` — stored fresh `medium` intent with body-only sources → filter off and an out-of-scope
  SUGGESTION is persisted; same intent plus `{kind:'issue', status:'ok'}` → SUGGESTION dropped.
- **Implement:** `scopeFilter = !stale && confidence !== 'low' && hasFetchedExplicitSource(row.sources)`;
  log line names the reason when off (`no fetched issue/spec/plan — scope filter off`).
- **Verify:** `cd server && pnpm typecheck && pnpm exec vitest run test/intent-helpers.test.ts` +
  `TEST_DATABASE_URL=… pnpm exec vitest run test/reviews-intent.it.test.ts`
- **Depends on:** S2 · **Done when:** AC3, AC4.

### S4 — Regression gates  [all]
- **Verify:** `cd reviewer-core && npm run typecheck && npm test` · `cd server && pnpm typecheck &&
  pnpm exec vitest run --exclude '**/*.it.test.ts'` · each of `intent.it`, `reviews-intent.it`,
  `reviews.it`, `reviews-skills.it`, `skills-injection.it` on a fresh DB · `cd client && pnpm
  typecheck && pnpm test` · `git grep -nE "pickScopeSignal|withScopeSignal|compareScopeSignal|scopeCandidate|isScopeSignalEligible|runWithScopeSignal|scope-signal"`
  returns only docs being updated in S5 (then nothing).
- **Done when:** AC6.

### S5 — Spec + docs + insights  [docs]
- **Files:** `specs/L03-intent-layer.md` (amend AC7/AC8 and the Decisions rows for signal
  eligibility/cardinality/when the filter applies, with date and a link to this plan);
  `reviewer-core/README.md`, `server/README.md`, `docs/agent-prompts/README.md` where they describe
  the single signal or two-phase completion; `server/INSIGHTS.md` + `reviewer-core/INSIGHTS.md`:
  replace the "two-phase / one serious signal" entries' guidance with a dated follow-up entry
  ([Security] the author controls intent, so the filter never drops serious findings and needs a
  fetched issue/spec/plan) — keep the old entries, mark them superseded.
- **Verify:** every cited path exists.

## Out of scope
UI changes (the badge already exists), classifier prompt, staleness rules, Jira/Linear.
