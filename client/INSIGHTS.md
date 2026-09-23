# Insights — client

Dated entries, newest first. Format and rubrics: [../.claude/skills/engineering-insights/SKILL.md](../.claude/skills/engineering-insights/SKILL.md).

## 2026-09-19 — [Pitfall] Absolutely-positioned popovers get clipped by the PR table and agent cards
Symptom: the findings preview was cut off at the bottom edge of the PR list card (only the header and first row visible).
Cause: `tableCard` and `AgentCard` use `overflow: hidden` for rounded corners, so any descendant positioned outside their box is clipped.
Rule: floating UI (popovers, menus) must render in a portal on `document.body` with `position: fixed` computed from the trigger's `getBoundingClientRect()`, close on scroll/resize, and keep a short hover grace period so the pointer can travel into the card.
Proof: `client/src/components/findings-preview-popover/FindingsPreviewPopover.tsx:189`, `client/src/app/repos/[repoId]/pulls/styles.ts:29`

## 2026-09-19 — [Architectural decision] The PR page derives severity counters locally, the list gets them from the API
Context: the PR page already loads every review with findings; the PR list must stay one request.
Decision: `client/src/lib/findings.ts` mirrors the server rule (newest review per agent, dismissed excluded) for the header/accordion/timeline; the list reads `PrMeta.findings` and lazily loads reviews only on hover for the popover.
Consequence: any change to the rule must be made in BOTH `server/src/modules/reviews/severity.ts` and `client/src/lib/findings.ts`; the unit tests of each encode the same fixture.
Proof: `client/src/lib/findings.ts:37`, `server/src/modules/reviews/severity.ts:42`

## 2026-09-19 — [Non-obvious behaviour] Hover popovers must stop click propagation inside PR rows
Symptom: clicking a severity chip inside a PR row navigates to the PR without the filter, or the popover closes the moment it is clicked.
Cause: the whole PR row is a click target (`router.push` on the row), so any child click bubbles up.
Rule: interactive children of a row (`SeverityCounters`, the popover card) call `e.stopPropagation()`; links keep `href` for middle-click and also push with the filter.
Proof: `client/src/components/severity-counters/SeverityCounters.tsx:63`, `client/src/components/findings-preview-popover/FindingsPreviewPopover.tsx:91`

## 2026-09-17 — [Pitfall] The two `vendor/shared` copies already drift
Symptom: `diff -r server/src/vendor/shared client/src/vendor/shared` reports 5 differing files before any L01 change.
Cause: the server copy gained fields (`sessionId`, `CommitFile`, provider ids) that were never mirrored.
Rule: apply new contract edits to BOTH copies in the same commit; do not attempt a full re-sync inside a feature branch.
Proof: `server/src/vendor/shared/adapters.ts:69`, `client/src/vendor/shared/adapters.ts:77`

## 2026-09-17 — [Non-obvious behaviour] `next-intl` message files are the only source of column headers
Symptom: adding a column key to `COLUMN_KEYS` without a message renders the raw key path.
Cause: the PR list header maps `COLUMN_KEYS` → `t("list.columns.<key>")`.
Rule: every new column needs both `constants.ts` (`COLUMN_KEYS`, `GRID` width) and `messages/en/prReview.json`.
Proof: `client/src/app/repos/[repoId]/pulls/page.tsx:100`, `client/src/app/repos/[repoId]/pulls/constants.ts:42`

## 2026-09-17 — [Pitfall] Component tests run without the API
Symptom: a new test tries to reach `localhost:3001` and hangs or fails.
Cause: the suite is jsdom with a global setup file; there is no server in the loop, and the only real `fetch` lives in `src/lib/api.ts`.
Rule: mock the specific `src/lib/api.ts` function or the hook; real-stack checks go to `../e2e`.
Proof: `client/vitest.config.ts:15`, `client/vitest.config.ts:17`, `client/src/lib/api.ts:24`

## 2026-09-17 — [Non-obvious behaviour] Home redirects to the first repo returned by the API
Symptom: `/` lands on an unexpected repo on a dev DB.
Cause: the root page calls `router.replace` to `repos[0]` from `GET /repos`; onboarding only when the list is empty.
Rule: do not assume the seeded `acme/payments-api` is first; e2e flows need a freshly seeded DB.
Proof: `client/src/app/page.tsx:17`

## 2026-09-17 — [Architectural decision] `vendor/shared` is a mirror, not a package
Context: no workspace, so the client cannot depend on `server/src/vendor/shared` directly.
Decision: the client carries its own copy under `src/vendor/shared`, aliased as `@devdigest/shared`.
Consequence: contracts drift silently unless both copies change in the same commit; change the server copy first.
Proof: `client/tsconfig.json:24`, `server/tsconfig.json:22`

## 2026-09-17 — [Non-obvious behaviour] i18n messages already contain files for unbuilt lessons
Symptom: `messages/en/` has `blast.json`, `brief.json`, `ci.json`, `conventions.json` with no matching screens.
Cause: the starter ships the full message catalog; screens are added lesson by lesson.
Rule: reuse the existing JSON for a lesson's screen instead of creating a new namespace.
Proof: `client/messages/en/blast.json:1`, `client/messages/en/brief.json:1`
