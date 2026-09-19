# L01 — Findings by severity (counters · filter · hover preview)

Status: **design approved 2026-09-18, not implemented**. Plan: [L01-findings-severity-plan.md](L01-findings-severity-plan.md).
Reference screenshots: PR list with a FINDINGS column + hover popup; PR timeline rows with per-run
counters + hover popup ("2 findings in this run").

## Goal

Every place a reviewer looks at a PR or an agent answers "how bad is it?" at a glance:
`3 CRITICAL · 5 WARNING · 2 SUGGESTION`, colour-coded, hoverable for a preview of the actual
findings, clickable to see only that severity.

## Decisions (agreed 2026-09-18)

| Question | Decision |
|----------|----------|
| What counts | Findings of the **latest review per agent** for the PR, **excluding dismissed**. Re-runs never double-count; a dismissed finding disappears from counters immediately. |
| Click on a severity (PR list) | Navigates to `/repos/:repoId/pulls/:number?tab=findings&severity=CRITICAL`. On the PR page the same counters toggle the filter; the filter lives in the URL (shareable, survives reload). |
| Agents page | Counters on each `AgentCard` (workspace-wide, same counting rule per PR) + hover popup with that agent's 6 most recent findings, each tagged with its PR number. |
| Hover popup | Header `N FINDINGS` (or `N FINDINGS IN THIS RUN`), then up to **6** findings sorted CRITICAL → WARNING → SUGGESTION; each row: severity icon, title, category chip, `file:start-end` mono, confidence %, first ~140 chars of rationale. Footer `+K more` when truncated. Opens after 150 ms hover, closes on mouse-leave; also opens on keyboard focus (accessible). |
| Zero state | Reviewed PR with zero active findings: a green `✓ 0` chip. Never-reviewed PR: `—`. A level with count 0 is not rendered (matches reference: `⚠ 2 · 💡 4`). |
| Live runs | Counters update when a run settles, via the existing `pr-runs` / `pr-reviews` query invalidation; no new SSE work. |

## Screens

### 1. PR list — new **Findings** column (between Score and Cost)

`SeverityCounters` chip group: `⊘ 2 · ⚠ 2 · 💡 2` in crit/warn/suggestion colours, each level an
`<a>`/`<button>` to the filtered PR page. Hover on the group opens `FindingsPreviewPopover` for
the PR. Grid gains a 110px column.

### 2. PR page

- **Header** (`PrDetailHeader`): the same `SeverityCounters` next to the status badge = the
  PR summary across all agents (latest review per agent, dismissed excluded). Click toggles
  `?severity=` for the Findings tab.
- **Timeline rows** (`RunHistory`): per-run counters under the agent name (reference shows
  `⊘ 2 ⚠ 1 · 2 blockers`). Hover opens the popover scoped to that run ("N findings in this run").
  A run that is not the agent's latest still shows its own counts (they describe the run), but
  does not feed the header summary.
- **Review runs** (`ReviewRunAccordion` header): counters replace the plain "3 findings" text;
  the blockers suffix stays.
- **Findings panel**: honours `?severity=`; a `SeverityFilterBar` (All · Critical · Warning ·
  Suggestion with counts) sits next to the existing "hide low confidence" toggle. Empty state
  when the level has no findings.

### 3. Agents page

`AgentCard` meta row gains `SeverityCounters` for the agent (workspace-wide). Hover opens the
popover with the agent's 6 most recent active findings, each row prefixed with `#<pr number>`.
Click on a level opens `/agents/:id` (the editor) — no filtered view there in this lesson.

## Data model & contracts

No schema change. Everything derives from `reviews` + `findings` (+ `agent_runs` for run ↔ review).

```ts
// @devdigest/shared — contracts/findings.ts
export const SeverityCounts = z.object({ critical: z.number().int(), warning: z.number().int(), suggestion: z.number().int() });

// contracts/platform.ts — PrMeta (list endpoint)
findings: SeverityCounts.nullish()      // null = never reviewed; zeros = reviewed, all clear

// contracts/review-api.ts — ReviewRecord gains nothing: findings[] is already there.

// contracts/knowledge.ts — Agent (GET /agents) gains
findings: SeverityCounts.nullish()      // null = no reviews yet

// NEW GET /agents/:id/findings?limit=6 → FindingPreview[]
export const FindingPreview = Finding.pick({ id, severity, category, title, file, start_line, end_line, confidence, rationale })
  .extend({ pr_id: z.string(), pr_number: z.number().int(), review_id: z.string() });
```

**Server rule, one place:** `latestActiveFindings(prId)` in `modules/reviews/findings.ts` =
for each `agent_id`, the newest `reviews.kind='review'` row; its findings with
`dismissed_at IS NULL`. `rollupSeverities` (already in `modules/pulls/status.ts`) turns rows into
counts. Both the PR list and the agent aggregates call this helper, so the numbers never diverge.

**Client rule, one place:** `client/src/lib/findings.ts` — `countBySeverity(findings)` and
`latestPerAgent(reviews)` used by the header, the accordion, and the timeline, so the PR page
computes counters from the reviews it already has (`usePrReviews`) instead of extra requests.

**Popover data:**
- PR list: on hover, `usePrReviews(prId)` (existing endpoint, TanStack-cached) → filter with the
  client rule. No new endpoint. Prefetch on `mouseenter` so the popup is instant on the second hover.
- PR page: already loaded.
- Agents page: `GET /agents/:id/findings?limit=6` fetched on hover.

## Improvements over the reference (proposed, in scope unless struck)

1. **Dismissed findings leave the counters** — the reference counts everything; ours reflects triage, which is the whole point of accept/dismiss.
2. **Blockers badge stays separate** — "2 blockers" is the CI-gate signal (severity ≥ agent's `ci_fail_on`); it must not be confused with the CRITICAL count when an agent's gate is `warning`.
3. **Zero-clear state** (`✓ 0`) distinguishes "reviewed, clean" from "never reviewed" (`—`) — the reference shows nothing for both.
4. **Keyboard + a11y**: counters are real buttons with `aria-label="2 critical findings, filter"`, popover is `role="dialog"`, opens on focus, closes on Escape. `j`/`k` navigation in the findings panel keeps working under a filter.
5. **URL-backed filter** (`?severity=`) instead of component state: deep-linkable from Slack/CI, and the PR list click lands on exactly the right view.
6. **Popover shows the agent name per finding** on the PR list (multi-agent PRs) — the reference omits it, but it's the first question a reviewer asks.
7. **Counters in the agent card are workspace-wide and use the same latest-per-PR rule**, so an agent that keeps re-running does not inflate its numbers.

## Out of scope (say so explicitly)

- Sorting the PR list by findings; a "critical only" PR-list filter chip (natural follow-up).
- Per-agent stats page / trend charts (`AgentStats` contract exists for L08 — this feature only
  fills `findings_by_severity`-shaped counts, not the rest).
- Changing what counts as a blocker.
- Popover pinning / click-to-open (hover + focus only).

## Acceptance criteria

- [ ] `GET /repos/:id/pulls` returns `findings` counts per PR under the latest-per-agent, non-dismissed rule; `null` for never-reviewed PRs; dismissing a finding changes the count on the next fetch.
- [ ] `GET /agents` returns `findings` counts per agent; `GET /agents/:id/findings?limit=6` returns the newest active findings with `pr_number`.
- [ ] PR list shows a Findings column; hover opens a popover listing ≤ 6 findings with `+K more`; click on a level navigates to the PR with `?tab=findings&severity=…`.
- [ ] PR header shows the summary counters; clicking toggles the URL filter; the findings panel shows only that severity and the filter bar reflects counts.
- [ ] Timeline rows and accordion headers show per-run counters; timeline hover shows "N findings in this run".
- [ ] Agent cards show counters and a hover popover with PR numbers.
- [ ] Reviewed-clean PR shows `✓ 0`; never-reviewed shows `—`.
- [ ] Tests: server unit (rule helper), server `.it.test` (list + agents endpoints incl. dismiss), client component tests for `SeverityCounters`, `FindingsPreviewPopover`, filter bar, PRRow, AgentCard; e2e flow 02 asserts the Findings header and the seeded `⊘ 1 · ⚠ 1` counters.

## Links

- Existing pieces to reuse: `server/src/modules/pulls/status.ts` (`rollupSeverities`, unused today), `client/src/vendor/ui/primitives/Badge.tsx` (`SeverityBadge`), `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/helpers.ts` (`visibleFindings`, `SEVERITY_ORDER`), `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/constants.ts` (`SEV_COLOR`).
- Contract with the same shape already planned for L08: `server/src/vendor/shared/contracts/observability.ts:96` (`AgentStats.findings_by_severity`).
- Cost column (sibling feature, same list grid): [L01-run-cost.md](L01-run-cost.md).
