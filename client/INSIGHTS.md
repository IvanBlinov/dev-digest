# Insights — client

Dated entries, newest first. Format and rubrics: [../.claude/skills/engineering-insights/SKILL.md](../.claude/skills/engineering-insights/SKILL.md).

## 2026-09-30 — [Pitfall] Async previews can land after the input changed
Symptom: an import preview for an old URL could appear under a newly typed URL.
Rule: remember the requested value (ref) and drop responses that don't match the current input; clear the preview on every input change.
Proof: `client/src/app/skills/_components/SkillsLabView/_components/ImportUrlSkillModal/ImportUrlSkillModal.tsx`

## 2026-09-30 — [Pitfall] A flex chip next to a `minWidth: 0` name squeezes the name to nothing
Symptom: blocked skill cards showed the "Injection detected" chip but no skill name.
Cause: the name was `flex: 1; minWidth: 0` while the badge doesn't shrink, so the name got 0 px on narrow cards.
Rule: give the primary label a real `minWidth` and wrap secondary chips in a shrinkable slot (`flex: 0 1 auto; minWidth: 0; overflow: hidden`).
Proof: `client/src/app/skills/_components/SkillsLabView/_components/SkillCard/styles.ts:24`

## 2026-09-30 — [Pitfall] Never run `next build` while `next dev` serves the same folder
Symptom: the dev app turned unstyled and stopped hydrating (404 for main-app.js / layout.css).
Cause: `next build` overwrites `.next`, which the running dev server is using.
Rule: stop the dev server, build, then `rm -rf .next` and start dev again.
Proof: `client/package.json:1`

## 2026-09-30 — [Non-obvious behaviour] Mutation errors are already toasted globally
Symptom: a component's own `onError` toast for a failed mutation shows twice or the custom one seems never to win.
Cause: the app's `MutationCache` has a global `onError` that toasts every mutation error.
Rule: in components handle failures for UI state only (keep a modal open, roll back); don't add another toast.
Proof: `client/src/lib/providers.tsx:42`

## 2026-09-30 — [Pitfall] next-intl `t.rich`: a tag named like a value overwrites it
Symptom: `<repo>{repo}</repo>` rendered the tag function's output instead of the repo name.
Rule: give rich-text tags names distinct from interpolated values (`<mono>{repo}</mono>`).
Proof: `client/messages/en/conventions.json:81`

## 2026-09-29 — [Pitfall] Runtime (non-type) imports from `@devdigest/shared` break `next build`
Symptom: `pnpm test` and `pnpm typecheck` pass, but `next build` fails to resolve `./contracts/knowledge.js`.
Cause: the shared barrel re-exports with `.js` extensions that webpack can't map to `.ts`; vitest and tsc accept them. `import type` is erased, so only value imports (schemas, constants) hit it.
Rule: import only types from `@devdigest/shared` in client code; mirror needed constants locally with a test asserting they equal the contract (see `skill-helpers.ts`). Run `pnpm build` when adding a shared import.
Proof: `client/src/vendor/shared/index.ts:20`, `client/src/lib/skill-helpers.ts:10`

## 2026-09-29 — [Non-obvious behaviour] A modal rendered inside a clickable card triggers the card's onClick
Symptom: clicking Cancel in the delete confirm also opened the agent.
Cause: `Modal` is not a portal, and React synthetic events bubble through the component tree even when the DOM is positioned elsewhere.
Rule: wrap a dialog rendered inside a clickable parent in an element that calls `e.stopPropagation()`.
Proof: `client/src/app/agents/_components/AgentCard/AgentCard.tsx:57`

## 2026-09-29 — [Pitfall] `beforeEach(() => mock.mockReset())` — the returned value becomes a teardown
Symptom: a mock receives a stray call with no arguments between tests.
Cause: vitest treats a function returned from `beforeEach` as a cleanup and calls it; `mockReset()` returns the mock itself.
Rule: use a block body `beforeEach(() => { mock.mockReset(); })`; for `vi.mock` factories that need shared consts, create them with `vi.hoisted`.
Proof: `client/src/app/skills/_components/SkillsLabView/_components/CreateSkillModal/CreateSkillModal.test.tsx:17`, `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.test.tsx:9`

## 2026-09-29 — [Architectural decision] Skills Lab master/detail lives in `app/skills/layout.tsx`
Context: req 10 wants a side-panel preview, req 25 a `/skills/:id` page with tabs.
Decision: the list is rendered by the route layout, `/skills` and `/skills/[id]` only fill the right panel — the list never unmounts and the URL stays shareable.
Consequence: new skill sub-routes render inside the same layout; don't fetch the list again in pages.
Proof: `client/src/app/skills/layout.tsx:5`

## 2026-09-29 — [Non-obvious behaviour] `api.ts` is generic — new endpoints need only a hook
Symptom: client/AGENTS.md told agents to add a per-endpoint function to `src/lib/api.ts`, which has none to extend.
Cause: `api` exposes only `get/post/put/patch/del`; every hook calls them directly with the path and a `@devdigest/shared` type.
Rule: new endpoint → hook in `src/lib/hooks/<area>.ts` calling `api.get<T>(...)`; `api.ts` stays unchanged (AGENTS.md corrected).
Proof: `client/src/lib/api.ts:65`, `client/src/lib/hooks/core.ts:102`

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
