# L01 — Findings by severity: implementation plan

Spec: [L01-findings-severity.md](L01-findings-severity.md). Order: shared rule + contracts →
server endpoints → client primitives → screens → e2e. TDD per step; check commands per package
as in [L01-run-cost-plan.md](L01-run-cost-plan.md). Estimated total: ~1 day.

---

## Step 1 — Contracts (server copy, then mirror) · 15 min

`contracts/findings.ts`: `SeverityCounts`, `FindingPreview`. `PrMeta.findings`, `Agent.findings`
as `SeverityCounts.nullish()`. Mirror all edits into `client/src/vendor/shared`.
**Test** `server/test/contracts.test.ts`: parse fixtures with and without `findings`.

## Step 2 — Server rule helper · 30 min

`server/src/modules/reviews/findings.ts` (file exists — extend): pure
`pickLatestPerAgent(reviews: {agentId, createdAt, id}[]) → reviewIds` and
`activeFindings(rows) → rows without dismissedAt`. Reuse `rollupSeverities` from `pulls/status.ts`
(move it next to these helpers and re-export from `status.ts` to keep imports stable).
**Test** `server/test/reviews-helpers.test.ts`: two agents × two runs → only the newest per agent;
dismissed excluded; agent with `agentId=null` (deleted agent) keeps its newest review.

## Step 3 — PR list counts · 30 min

`modules/pulls/routes.ts` `GET /repos/:id/pulls`: replace the "latest review score" query with
one query that fetches `reviews(kind='review')` + their findings for all `prIds`, then per PR:
score from the newest review overall (unchanged behaviour) and `findings` from
latest-per-agent active rows. Keep it two IN-queries + JS grouping (list is small, comment in the
route already argues this).
**Test** `server/test/reviews.it.test.ts`: after one run → counts `{critical:1, warning:0,
suggestion:0}` (seeded fixture keeps one CRITICAL after grounding); dismiss it via
`POST /findings/:id/dismiss` → counts all zero (not null); untouched PR → `null`.

## Step 4 — Agents endpoints · 45 min

- `GET /agents`: enrich each agent with `findings` = sum over PRs of the same rule, restricted to
  that agent's reviews (helper takes `agentId`). One query for all agents: reviews joined with
  findings where `dismissed_at IS NULL`, grouped in JS by `(prId, agentId)` → newest review.
- `GET /agents/:id/findings?limit=6` (`limit` 1..20, default 6): newest active findings of the
  agent's latest-per-PR reviews, joined with `pull_requests.number` → `FindingPreview[]`.
**Tests** `server/test/agents-versions.it.test.ts` (or new `agents-findings.it.test.ts`): counts
after a run; preview returns `pr_number`; limit clamps.

## Step 5 — Client primitives · 1.5 h

- `client/src/lib/findings.ts`: `countBySeverity(findings)`, `latestPerAgent(reviews)`,
  `SEVERITY_LEVELS` (order, colour token, icon, label key). **Unit test.**
- `client/src/components/severity-counters/SeverityCounters.tsx`: props `counts`, `variant:
  'chips' | 'inline'`, `onSelect?(level)`, `active?: level`, `hrefFor?(level)`; renders only
  non-zero levels; `✓ 0` when all zero; `—` when `counts` is null. Buttons with `aria-label`.
  **Test**: zero/null/partial rendering; click calls `onSelect`.
- `client/src/components/findings-preview-popover/FindingsPreviewPopover.tsx`: wraps a trigger;
  props `title`, `findings: FindingPreview-like[]`, `max=6`, optional `renderPrefix(f)` (agent
  name or `#pr`). Positioning: absolute below the trigger, flips above when near the viewport
  bottom (simple `getBoundingClientRect` check). Opens after 150 ms hover or on focus; closes on
  leave/blur/Escape. **Test**: opens on hover, lists ≤ 6, shows `+K more`, Escape closes.
- i18n: `messages/en/prReview.json` (`list.columns.findings`, `severity.*`, `preview.*`),
  `messages/en/agents.json` (`card.findings`).

## Step 6 — PR list · 45 min

`constants.ts`: `GRID` → `"1fr 132px 92px 60px 110px 74px 118px 78px"`, `COLUMN_KEYS` insert
`"findings"` after `"score"`. `PRRow`: `SeverityCounters` inside `FindingsPreviewPopover`; on
hover call `queryClient.prefetchQuery` for `pr-reviews`; `hrefFor(level)` →
`/repos/${repoId}/pulls/${pr.number}?tab=findings&severity=${level}`; stop row-click propagation.
**Test** `PRRow.test.tsx`: counters render; click on Critical pushes the filtered URL.

## Step 7 — PR page · 1.5 h

- `page.tsx`: read `severity` from `useSearchParams`; pass to `FindingsTab`; `setSeverity(level)`
  writes the URL (`router.replace`, keep `tab`).
- `PrDetailHeader`: new prop `counts`; render `SeverityCounters` (active = current filter,
  `onSelect` toggles).
- `FindingsTab`: compute `counts` via `latestPerAgent` + `countBySeverity`; pass `severity` down.
- `FindingsPanel`: new prop `severity`; `visibleFindings(findings, hideLow, severity)`;
  `SeverityFilterBar` (All + 3 levels with counts) next to the toggle. Keep `focusIdx` clamped when
  the filter shrinks the list.
- `RunHistory`: per-run counts from the matching review (prop `reviewsByRunId`), `SeverityCounters
  variant="inline"` under the agent name, wrapped in the popover titled "N findings in this run".
- `ReviewRunAccordion`: counters replace "N findings" text; blockers suffix unchanged.
**Tests**: `FindingsPanel.test.tsx` (filter narrows, empty state), `RunHistory.test.tsx`
(counters + hover title), `ReviewRunAccordion.test.tsx`, header test if one exists.

## Step 8 — Agents page · 45 min

`useAgentFindings(id)` hook (`GET /agents/:id/findings`, `enabled` only when hovered).
`AgentCard`: `SeverityCounters` in the meta row inside `FindingsPreviewPopover` with
`renderPrefix = #pr_number`. **Test** `AgentCard.test.tsx`: counters; hover fetches and lists.

## Step 9 — e2e · 15 min

Flow 02: `wait --text "Findings"` header; flow 04: seeded PR #482 has 1 CRITICAL + 1 WARNING →
`wait --text "1"` is too loose; assert via `find role button --name "1 critical findings"`
(the aria-label). Run hermetic (needs `agent-browser`).

## Step 10 — Docs + insights · 15 min

READMEs: client route map (Findings column, `?severity=`), server API map (`/agents/:id/findings`).
Record insights (candidates: `rollupSeverities` was dead code; latest-per-agent rule location;
popover positioning gotcha if any).

---

## Risks

- **List endpoint weight**: loading findings for every PR in the list. Mitigation: select only
  `severity, dismissed_at, review_id`; the popup fetches full rows lazily.
- **Deleted agents**: reviews with `agent_id = null` — treat `null` as its own "agent" bucket so
  their findings still count (documented in the helper test).
- **Grid width** at 1280px: four fixed columns now; verify the title column still wraps sensibly.
- **Hover on touch devices**: focus/click fallback opens the popover (variant `'chips'` buttons).
