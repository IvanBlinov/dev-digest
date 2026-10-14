# Development Plan: Smart Diff (reviewer-ordered Files changed tab)

**Spec:** none — S0 writes `specs/L03e-smart-diff.md` (see Key constraints, row 1) · **Base commit:** f2edb8d
**Packages:** server, client, e2e (reviewer-core untouched) · **Size:** L (12 steps)

## Goal
On a PR's **Files changed** tab, files are grouped by role in the order core → tests → wiring → docs → boilerplate. Each group header shows the role and how many of its files have findings. Under each finding's line there is an inline finding comment you can accept or dismiss, and the line gets a severity bar. A "Smart order | Original order" toggle switches back to GitHub order.

## Acceptance criteria
- AC1 — `classifyFile(path)` applies the agreed rules in order (boilerplate → tests → wiring → docs → core). It imports no HTTP or container code → `server/test/smart-diff-helpers.test.ts`
- AC2 — `GET /pulls/:id/smart-diff` returns a Zod-valid `SmartDiffResponse` with non-empty groups in role order. `finding_lines` holds the `start_line`s of non-dismissed findings, taken from the newest `kind='review'` review of each agent. `split_suggestion` = `{too_big:false,total_lines:Σ(add+del),proposed_splits:[]}`. It works before any review (empty `finding_lines`), makes no LLM call, and returns 404 for an unknown PR → `server/test/smart-diff.it.test.ts`
- AC3 — The diff tab shows the header "Reviewer-ordered diff · N files · +A −D" and the groups in role order. Each group header has a role label and "N files". Docs and boilerplate file cards start collapsed; other cards follow `AUTO_EXPAND_MAX_LINES`. A lock file lands in boilerplate → `DiffTab.test.tsx`, `SmartGroupHeader.test.tsx`, flow 09
- AC4 — After a review, a group header shows a red dot and a number just before "N files". The number counts files with ≥1 non-dismissed finding, not findings. Before any review the header shows "Review not run yet" and no counters → `SmartGroupHeader.test.tsx`, `DiffTab.test.tsx`
- AC5 — A file card header shows a dot with no number when the file has active findings. It is a separate element from the GitHub comment counter → `FileCard.test.tsx`
- AC6 — A finding renders as a `FindingCard` (severity, title, rationale, suggestion, Accept/Dismiss, collapsible) under the line keyed `RIGHT:${start_line}`. That line gets a left bar and a right-aligned label in the `SEV` colour: blocker / warning / suggestion. Findings whose line is not in the patch go to a "Findings outside the diff" block at the end of the file. Dismissed findings still render, muted, but give no bar, dot or count → `FileCard.test.tsx`, `DiffTab.test.tsx`, flow 09
- AC7 — The comments toggle that hides GitHub comments hides finding comments too → `DiffTab.test.tsx`
- AC8 — `?order=original` renders today's `DiffViewer` unchanged. Smart order is the default. The toggle writes and clears the URL param → `DiffTab.test.tsx`, flow 09
- AC9 — Accept/Dismiss updates the counters and dots without a reload, because they are computed from `usePrReviews`. A finished run invalidates `["smart-diff", prId]` → `DiffTab.test.tsx`, `smart-diff.test.tsx` (hook)
- AC10 — Every new string comes from `prReview.smartDiff` → the RTL tests render with the real `messages/en/prReview.json`

## Key constraints
| Source (file:line) | Rule or insight | Effect on this plan |
|---|---|---|
| `README.md:84-85` | Smart Diff is lesson **L03**; L04 is MCP/Blast Radius; `specs/L03d-*` exists | Spec is named `specs/L03e-smart-diff.md`, not `L04-smart-diff.md` (this overrides decision 6) |
| `server/src/modules/reviews/severity.ts:42,60` | `pickLatestPerAgent`, `activeFindings` are the one rule for "the PR's findings" (`server/INSIGHTS.md:136`) | The service reuses them, after a `kind==='review'` filter that mirrors the client |
| `client/src/lib/findings.ts:37,49,69,74` | Client `latestPerAgent` (skips non-review rows), `activeFindings`, `prActiveFindings`, `prSeverityCounts` (null = never reviewed) | "Latest" = newest review per agent, the same rule the PR header counters use (`page.tsx:93`). FindingsTab lists every run, but its counts use this rule. Counts and "not run yet" use these helpers |
| `client/INSIGHTS.md:33` | A value import from `@devdigest/shared` breaks `next build` | Client uses `import type { SmartDiffRole, … }` only. The role→label map is a typed local constant |
| `server/src/modules/intent/service.ts:67` | Intent reuses `ReviewRepository` (`getPull`, `getPrFiles`, `reviewsForPull`) | smart-diff has **no repository.ts**: all of its reads already exist in `ReviewRepository` |
| `client/src/components/diff-viewer/FileCard/FileCard.tsx:35-37,51-74` | Auto-expand rule; comment counter in the header | Add an optional `defaultOpen` and a separate flag dot. Leave the counter as it is |
| `.claude/skills/frontend-architecture` | A shared component takes screen wording as props and may not import route `_components` | diff-viewer gets a generic `DiffAnnotationApi` (nodes and labels passed in). `FindingCard` stays in the route, and DiffTab supplies it |
| `server/src/db/seed.ts:123-128` | Seeded `pr_files` have no `patch`, and the insert runs only when PR #482 is new | S4 adds patches and 5 files inside that block. Existing dev DBs keep the old rows, so a fresh DB is needed (never `down -v`) |
| `server/src/modules/reviews/diff-loader.ts:28-44` | Reviews fall back to the `pr_files` patches when git diff is empty | Seeded patches change the review diff that DB tests see on PR #482. S4 re-runs the review/intent `.it` tests |
| `server/INSIGHTS.md:142` | Testcontainers cannot publish ports here; use `TEST_DATABASE_URL` | Every `.it` verify command is prefixed with `TEST_DATABASE_URL` (per the `db-schema-change` skill) |

## Constraints hit
- **Concurrent work:** `run-executor.ts`, `intent/*`, `reviewer-core/src/prompt.ts`, `platform/config.ts`, `app.ts` and `server/test/contracts.test.ts` are dirty in the tree. Only `contracts.test.ts` is touched here (S1, one new `it`). Do it on the new branch after that work is committed. No other step edits those files.
- **vendor/shared mirror:** `brief.ts` is identical in both copies at HEAD (checked with `diff`). S1 edits the server copy, then `cp`, then checks that `diff` is empty.
- **No new dependency:** the server has no glob library (`server/package.json`), so the classifier uses hand-written matchers.
- **Migrations:** none needed. `pr_files.patch` already exists (`server/src/db/schema/pulls.ts:44`).

## Contract & data changes
| Contract / table | Before → after | Optional/nullable choice | Consumers to update |
|---|---|---|---|
| `SmartDiffRole` (`brief.ts:131`, both copies) | `['core','wiring','boilerplate']` → `['core','tests','wiring','docs','boilerplate']` (declaration order = display order) | n/a (enum widened; nothing is persisted) | new smart-diff module; client type-only use; `contracts.test.ts:131` |
| `SmartDiffResponse` (`review-api.ts:86`) | unchanged | — | new route response schema, `useSmartDiff` |
| `pr_files` seed rows (PR #482) | 4 rows, no patch → 9 rows; patches on `src/config.ts`, `src/api/users.ts`, `docs/rate-limiting.md`, `pnpm-lock.yaml` | — | seed only |

## Steps

### S0 — Spec  [package: root · layer: docs]
- **Skills:** engineering-insights (fact check for `specs/**`)
- **Files:** create `specs/L03e-smart-diff.md` (template in `specs/README.md`)
- **Test first:** no test: docs only
- **Implement:** Fill in Goal, Scope (In: the ACs above; Out: LLM pseudocode summaries, real split suggestions, an L08 prompt filter), Contracts (role enum, route), Per-package work, and AC1–AC10 as checkboxes. State the naming deviation (README L03 vs the requested L04). Record that `e2e/README.md` classifies as **tests**, by rule order.
- **Verify:** `ls specs/L03e-smart-diff.md` and check that every path it cites exists (`git ls-files`)
- **Depends on:** — · **Done when:** spec committed with all ACs

### S1 — Widen SmartDiffRole  [package: server+client · layer: contracts]
- **Skills:** shared-contracts, zod, test-strategy, engineering-insights
- **Files:** modify `server/src/vendor/shared/contracts/brief.ts:131`; mirror to `client/src/vendor/shared/contracts/brief.ts`; modify `server/test/contracts.test.ts` (new `it` beside `:131`)
- **Test first:** `contracts.test.ts` cases: `SmartDiff.parse` with groups `tests` and `docs` → ok; role `'misc'` → throws
- **Implement:** `z.enum(['core','tests','wiring','docs','boilerplate'])`, then `cp` to the client.
- **Verify:** `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts` (empty); `cd server && pnpm exec vitest run test/contracts.test.ts && pnpm typecheck`; `cd client && pnpm typecheck`
- **Depends on:** — · **Done when:** contract accepts all 5 roles

### S2 — Classifier + buildSmartDiff (pure)  [package: server · layer: domain]
- **Skills:** onion-architecture, test-strategy, engineering-insights
- **Files:** create `server/src/modules/smart-diff/constants.ts`, `server/src/modules/smart-diff/helpers.ts`, `server/test/smart-diff-helpers.test.ts`
- **Test first:** a table test for `classifyFile`:
  - `pnpm-lock.yaml`, `yarn.lock`, `x.lock`, `a/__tests__/__snapshots__/x.snap`, `client/dist/a.js`, `lib/x.generated.ts`, `v.min.js` → boilerplate
  - `src/a.test.tsx`, `server/test/x.it.test.ts`, `a.spec.ts`, `e2e/specs/09.flow.json`, `e2e/README.md` → tests
  - `package.json`, `src/index.ts`, `vitest.config.ts`, `tsconfig.base.json`, `.env.example`, `docker-compose.yml`, `.github/workflows/ci.yml`, `.claude/skills/security/SKILL.md` → wiring
  - `README.md`, `docs/adr.md`, `CHANGELOG.md`, `LICENSE` → docs
  - `src/config.ts`, `src/middleware/ratelimit.ts` → core

  `buildSmartDiff` cases:
  - files of mixed roles → groups in `ROLE_ORDER`, empty roles omitted, input order kept inside a group
  - findings `[{file:'src/config.ts',start_line:12},{…12},{…3}]` → `finding_lines:[3,12]` (sorted, unique)
  - a finding for a path that is not a PR file → ignored
  - `split_suggestion` → `{too_big:false,total_lines:Σ,proposed_splits:[]}`
  - output passes `SmartDiff.parse`
- **Implement:**
  - `constants.ts`: `ROLE_ORDER` and `CLASSIFY_RULES`, an ordered `readonly {role, basenames?, suffixes?, prefixes?, prefixSuffix?, includes?, segments?}[]` holding exactly the agreed patterns. Directory patterns match any path segment. Barrels = basename `index.ts`/`index.js`. `package.json` is wiring. `*.config.*` = basename includes `.config.`.
  - `helpers.ts`: `classifyFile(path): SmartDiffRole` (normalise `\`→`/`, split into segments and a basename; first rule that matches wins, else `'core'`) and `buildSmartDiff(files, findings): SmartDiff`. Both are pure, with no `container`/`db` imports.
  - Pattern to copy: `server/src/modules/intent/helpers.ts` (pure helpers next to a service).
- **Verify:** `cd server && pnpm exec vitest run test/smart-diff-helpers.test.ts && pnpm typecheck`
- **Depends on:** S1 · **Done when:** AC1

### S3 — Service + route + registration  [package: server · layer: service, route]
- **Skills:** onion-architecture, fastify-best-practices, security, test-strategy, engineering-insights
- **Files:** create `server/src/modules/smart-diff/service.ts`, `server/src/modules/smart-diff/routes.ts`, `server/test/smart-diff.it.test.ts`; modify `server/src/modules/index.ts:12,38` (import + entry `smartDiff`)
- **Test first:** `smart-diff.it.test.ts`, copying the harness at `server/test/intent.it.test.ts:1-60` (seed, `buildApp` with `MockLLMProvider`). Cases:
  - Seeded PR #482 with its findings deleted → 200, `SmartDiffResponse.parse` passes, every `finding_lines` is `[]`
  - A review is inserted with findings on `src/config.ts:12`, plus one dismissed finding on another file → only `[12]` appears
  - An older review of the same agent with other lines → ignored (newest per agent)
  - `llm.calls.length === 0`
  - Unknown uuid → 404
- **Implement:** `SmartDiffService.get(workspaceId, prId)`:
  1. `ReviewRepository.getPull` (404 via `NotFoundError` when missing), then `getPrFiles`, then `reviewsForPull`.
  2. Keep reviews with `kind==='review'`, then apply `pickLatestPerAgent` and `activeFindings` (`severity.ts:42,60`).
  3. Return `buildSmartDiff`.

  Route `GET /pulls/:id/smart-diff`, schema `{params: IdParams, response:{200: SmartDiffResponse}}`. It calls `getContext` and then the service. Copy `server/src/modules/intent/routes.ts:18-25`. No `container.db` in routes.
- **Verify:** `cd server && pnpm typecheck && TEST_DATABASE_URL=… pnpm exec vitest run test/smart-diff.it.test.ts`
- **Depends on:** S2 · **Done when:** AC2

### S4 — Seed: 9 files, small patches for PR #482  [package: server · layer: db]
- **Skills:** db-schema-change, drizzle-orm-patterns, postgresql-table-design, test-strategy, engineering-insights
- **Files:** modify `server/src/db/seed.ts:123-128`; extend `server/test/smart-diff.it.test.ts`
- **Test first:** new case "seeded PR #482 groups" → groups `core, tests, wiring, docs, boilerplate`; `pnpm-lock.yaml` is in boilerplate; Σadditions=247, Σdeletions=38; 9 files; after seed the `src/config.ts` patch parses to a new line 12 and the `src/api/users.ts` patch contains new line 45
- **Implement:** Keep the 4 rows and add patches to `src/config.ts` (+4, hunk containing new line 12) and `src/api/users.ts` (+7 −2, hunk covering new line 45). Model them on `server/test/grounding.test.ts:12-25`, with the `+`/`-` line counts matching additions/deletions. Add 5 rows:

  | path | additions / deletions | patch |
  |---|---|---|
  | `test/middleware/ratelimit.test.ts` | +68/−0 | null |
  | `package.json` | +2/−1 | null |
  | `pnpm-lock.yaml` | +31/−24 | short patch, or null |
  | `docs/rate-limiting.md` | +16/−0 | short patch |
  | `src/api/public/index.ts` | +4/−5 | null |

  The totals then equal the PR's `filesCount: 9`, `additions: 247`, `deletions: 38` (`seed.ts:115-117`). Leave the intent seed `'4 file(s)'` ref as it is (cosmetic; not part of `inputHash`).
- **Verify:** `cd server && pnpm typecheck && TEST_DATABASE_URL=… pnpm exec vitest run .it.test` (the whole DB lane, because `diff-loader.ts:28-44` now sees patches)
- **Depends on:** S3 · **Done when:** seeded PR #482 renders 5 groups with line-anchored findings; no other `.it` test regresses (report any deviation instead of weakening a test)

### S5 — `useSmartDiff` hook + invalidation  [package: client · layer: hook]
- **Skills:** frontend-architecture, react-best-practices, next-best-practices, react-testing-library, test-strategy, engineering-insights
- **Files:** create `client/src/lib/hooks/smart-diff.ts` and `client/src/lib/hooks/smart-diff.test.tsx`; modify `client/src/lib/hooks/index.ts` (`export * from "./smart-diff"`) and `client/src/app/repos/[repoId]/pulls/[number]/page.tsx:182-188` (in `onRunDone`, invalidate `["smart-diff", prId]`)
- **Test first:** `renderHook` in a fresh `QueryClientProvider` with `fetch` mocked:
  - `prId='p1'` → GETs `/pulls/p1/smart-diff` and returns data
  - `prId=null` → no fetch
- **Implement:** Copy `usePrReviews` (`client/src/lib/hooks/reviews.ts:51-57`): key `["smart-diff", prId]`, `api.get<SmartDiffResponse>`, and `import type` only.
- **Verify:** `cd client && pnpm exec vitest run src/lib/hooks/smart-diff.test.tsx && pnpm typecheck`
- **Depends on:** S3 · **Done when:** AC9 (the invalidation part)

### S6 — diff-viewer: pure annotation contract  [package: client · layer: component (pure)]
- **Skills:** frontend-architecture, react-testing-library, test-strategy, engineering-insights
- **Files:** create `client/src/components/diff-viewer/annotations.ts` and `client/src/components/diff-viewer/annotations.test.ts`; modify `client/src/components/diff-viewer/index.ts` (export the types)
- **Test first:** `partitionAnnotations(items, renderedKeys)`:
  - item key `RIGHT:12` is in the rendered keys → matched under `RIGHT:12`
  - `RIGHT:99` is not rendered → `outside`
  - two items on one key → both kept, in input order

  `markerForLine(ln, matched)` returns the first non-null marker found among the `keysForLine` keys.
- **Implement:**
  - Types: `LineAnnotation {id, path, key, marker: {color,label}|null, node: ReactNode}` and `DiffAnnotationApi {items, visible, flaggedPaths: ReadonlySet<string>, flagLabel, outsideTitle}`.
  - `partitionAnnotations`, the same shape as `partitionThreads` (`comments.ts:103-121`).
  - Reuse `keysForLine` (`comments.ts:66`). No React rendering in this file.
- **Verify:** `cd client && pnpm exec vitest run src/components/diff-viewer/annotations.test.ts && pnpm typecheck`
- **Depends on:** — · **Done when:** pure contract tested

### S7 — diff-viewer: FileCard / CodeLine / DiffViewer render annotations  [package: client · layer: component]
- **Skills:** frontend-architecture, react-best-practices, next-best-practices, react-testing-library, test-strategy, engineering-insights
- **Files:** modify `diff-viewer/FileCard/FileCard.tsx:33-95`, `diff-viewer/CodeLine/CodeLine.tsx:12-84`, `diff-viewer/DiffViewer/DiffViewer.tsx:13-31`, `diff-viewer/styles.ts`; create `diff-viewer/FileCard/FileCard.test.tsx`
- **Test first:** `FileCard.test.tsx`, wrapped with `shell.json`. Cases:
  - Flagged path → an element with `aria-label=flagLabel`, not containing a digit, separate from the comment counter (rendered with 2 comments → the counter shows "2" and the dot is a separate node)
  - Annotation `RIGHT:12` on a patch with new line 12 → its node renders immediately after that line; the line shows the marker label text
  - `RIGHT:99` → rendered under `outsideTitle` at the end of the file
  - `visible:false` → no nodes or outside block, but the markers and dot stay
  - `defaultOpen={false}` on a 3-line file → body not rendered
  - No `annotations` prop → output identical to today (no dot, no block)
- **Implement:**
  - FileCard props `defaultOpen?: boolean` and `annotations?: DiffAnnotationApi`. Partition per file next to the thread partition (`FileCard.tsx:43-49`). Render the dot after the path (`:60-62`). Render the outside block after `OutdatedComments` (`:91`), styled like `cs.outdatedWrap/outdatedTitle`.
  - CodeLine props `marker?` and `annotationNodes?: ReactNode[]`. The marker is a 3px inset left bar plus a right-aligned label in `marker.color`. Nodes render in a `cs.thread` rail after the threads.
  - DiffViewer passes `defaultOpen` and `annotations` through.
  - Colours always come from the caller (no palette here).
- **Verify:** `cd client && pnpm exec vitest run src/components/diff-viewer src/test/smoke.test.tsx && pnpm typecheck`
- **Depends on:** S6 · **Done when:** AC5; the mechanics of AC6 and AC7

### S8 — DiffTab helpers (grouping, counts, finding → annotation)  [package: client · layer: component (pure)]
- **Skills:** frontend-architecture, react-testing-library, test-strategy, engineering-insights
- **Files:** create `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/constants.ts`, `DiffTab/helpers.ts`, `DiffTab/helpers.test.ts`
- **Test first:**
  - `joinGroups(smartDiff, prFiles)` → `PrFile`s per group, in server order; a PR file missing from smart-diff is appended to core; empty groups dropped
  - `filesWithFindings(groupFiles, activeFindings)` → 2 findings in one file plus 1 in another = **2**
  - `lineLabelKey('CRITICAL')` → `'blocker'`, `'WARNING'` → `'warning'`, `'SUGGESTION'` → `'suggestion'`, `'INFO'` → null
  - `COLLAPSED_ROLES` has docs and boilerplate
  - `totals(files)` → `{files, additions, deletions}`
- **Implement:**
  - `constants.ts`: `ROLE_LABEL_KEY: Record<SmartDiffRole, string>` (type-only import, so a missing role is a compile error), `COLLAPSED_ROLES`, `SEVERITY_LINE_LABEL_KEY`.
  - Colours come from `SEV[sev].c` (`client/src/vendor/ui/primitives/tokens.ts:6-14`, exported from `@devdigest/ui`).
  - Findings for display = `latestPerAgent(reviews).flatMap(r=>r.findings)`. Counts use `activeFindings` (`client/src/lib/findings.ts:37,49`).
- **Verify:** `cd client && pnpm exec vitest run "src/app/repos/[repoId]/pulls/[number]/_components/DiffTab" && pnpm typecheck`
- **Depends on:** S1 · **Done when:** pure logic behind AC3, AC4 and AC6 tested

### S9 — SmartGroupHeader + i18n  [package: client · layer: component]
- **Skills:** frontend-architecture, react-best-practices, next-best-practices, react-testing-library, test-strategy, engineering-insights
- **Files:** create `DiffTab/_components/SmartGroupHeader/{SmartGroupHeader.tsx,index.ts,styles.ts,SmartGroupHeader.test.tsx}`; modify `client/messages/en/prReview.json:70-79`
- **Test first:** with real `prReview.json`:
  - `role='tests', fileCount=3, flaggedCount=2` → "Tests", "3 files", and a counter "2" whose dot precedes "3 files" in DOM order
  - `flaggedCount=0` → no counter
  - `reviewed=false` → no counter
- **Implement:**
  - Add keys under `smartDiff`: `testsLabel`, `docsLabel`, `reviewerOrdered`, `smartOrder`, `originalOrder`, `filesWithFindings` (aria, `{count}`), `fileHasFindings`, `reviewNotRun`, `outsideDiff`, `lineLabel.{blocker,warning,suggestion}`, `showComments`/`hideComments` (`{count}`), `totals`.
  - Header: sticky (`position:"sticky", top:0, zIndex:2`, opaque background); dot colour `var(--crit)`.
- **Verify:** `cd client && pnpm exec vitest run "src/app/repos/[repoId]/pulls/[number]/_components/DiffTab" && pnpm typecheck`
- **Depends on:** S8 · **Done when:** AC4 (header part), AC10 for these strings

### S10 — DiffTab: smart view, toggle, finding comments  [package: client · layer: component, page]
- **Skills:** frontend-architecture, react-best-practices, next-best-practices, react-testing-library, test-strategy, engineering-insights
- **Files:** modify `DiffTab/DiffTab.tsx` (whole file, 64 lines) and `page.tsx:193-199` (pass `order`, `onOrderChange` through `setParam("order", …)` at `:65`, plus `repoFullName`, `headSha`); create `DiffTab/DiffTab.test.tsx`
- **Test first:** `vi.mock("@/lib/hooks/reviews")` and `vi.mock("@/lib/hooks/smart-diff")`; wrap in a fresh `QueryClientProvider` and `NextIntlClientProvider` (`prReview` + `shell`). Cases:
  - Group headers in order; header text "9 files" and "+247"
  - The boilerplate card is collapsed and the core card is open
  - With no reviews → "Review not run yet"
  - With one CRITICAL finding on `src/config.ts:12` → the title renders under line 12 with label "blocker"; clicking Dismiss calls `mutate({findingId, action:'dismiss', prId})`
  - Rerender with that finding `dismissed_at` set → the group counter and the dot disappear, and the card is still shown, muted
  - The comments toggle hides the finding card
  - `order='original'` → no group headers; clicking "Original order" calls `onOrderChange('original')`
  - Smart-diff error → falls back to the original list
- **Implement:**
  - Header row: `SectionLabel` "Reviewer-ordered diff · N files · +A −D", the comments toggle, and a `Chip` pair (`@devdigest/ui`) for Smart/Original order.
  - Smart order: for each joined group, render a `SmartGroupHeader` then a `DiffViewer` with `defaultOpen={COLLAPSED_ROLES.has(role) ? false : undefined}` and a shared `annotations`. Each annotation `node` is a `FindingCard` (`_components/FindingCard`) with `onAction` from `useFindingAction()`.
  - Toggle state: `showOverride: boolean|null`, with `showComments = showOverride ?? activeFindings.length > 0`. The toggle shows when `comments + findings > 0`. Move its hard-coded English (`DiffTab.tsx:51-56`) to i18n.
  - Loading → `Skeleton`.
  - Original order → exactly the current `<DiffViewer files commenting/>`.
- **Verify:** `cd client && pnpm exec vitest run "src/app/repos/[repoId]/pulls/[number]" && pnpm typecheck && pnpm test` (+ `pnpm build` with `next dev` stopped; `client/INSIGHTS.md:16`)
- **Depends on:** S5, S7, S9 · **Done when:** AC3, AC4, AC6, AC7, AC8, AC9, AC10

### S11 — e2e flow 09  [package: e2e · layer: e2e]
- **Skills:** e2e-flows, test-strategy, engineering-insights
- **Files:** create `e2e/specs/09-smart-diff.flow.json`
- **Test first:** the flow itself fails before S4/S10 (no "Smart order" text and no line-anchored finding)
- **Implement:** Copy `e2e/specs/05-pr-diff.flow.json`, then add steps:
  1. wait `--text "Smart order"`
  2. wait `--text "pnpm-lock.yaml"`
  3. wait `--text "Hardcoded Stripe secret key in commit"` (rendered under line 12 because the toggle defaults to shown when findings exist)
  4. `find role button click --name "Original order"`
  5. wait `--url order=original`

  Avoid waiting on text that CSS uppercases (innerText follows `text-transform`). Read-only; no Run review.
- **Verify:** `cd e2e && npm run typecheck && npm run e2e:hermetic`
- **Depends on:** S4, S10 · **Done when:** AC3, AC6 and AC8 proven in a browser

### S12 — Docs + delivery-notes placeholder  [package: root, e2e · layer: docs]
- **Skills:** engineering-insights (fact check)
- **Files:** modify `specs/L03e-smart-diff.md` (append `## Delivery notes` with empty subsections "Subagents and roles", "Plan-verifier findings", "Deviations"; the main session fills them), `e2e/README.md:96-103` (flow table row 09), `e2e/AGENTS.md:17` ("Current:" list); record insights (e.g. seed patches feed `diff-loader`; classifier rule order puts `e2e/README.md` in tests)
- **Test first:** no test: docs only
- **Verify:** `git ls-files` check for every cited path
- **Depends on:** S11 · **Done when:** docs consistent; insights stated

## Verification matrix (run after the last step)
| Package | Commands |
|---|---|
| server | `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts' && TEST_DATABASE_URL=… pnpm exec vitest run .it.test` |
| client | `cd client && pnpm typecheck && pnpm test && pnpm build` (dev server stopped) |
| shared mirror | `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts` → empty |
| e2e | `cd e2e && npm run typecheck && npm run e2e:hermetic` |

## Risks
| Risk | Likelihood | Mitigation in plan |
|---|---|---|
| Seeded patches change what review/intent `.it` tests see through the `diff-loader` fallback | M | S4 runs the whole DB lane and reports deviations; no tests are weakened |
| Existing dev DBs never receive the new seed rows (the insert is guarded by "PR exists") | H | Documented in S12. Hermetic e2e uses a fresh DB. Never `down -v` |
| Directory rules match any segment, so `src/build/x.ts` → boilerplate | L | Accepted. The rule data in `constants.ts` is easy to tighten; noted in the spec |
| Showing comments by default changes the current hidden-by-default behaviour for GitHub comments when findings exist | M | Tri-state toggle; the user can still hide them. Listed in Open questions |
| `pr_files` order is unspecified (no ORDER BY at `pull.repo.ts:32` or `pulls/routes.ts:250`) | L | Smart order is deterministic by role. Within a group, insertion order matches what Original order shows |
| Sticky group headers overlap the app chrome | L | `top:0` inside the scroll container; checked visually in the e2e run |

## Out of scope
- LLM `pseudocode_summary`, real `proposed_splits`/`too_big`, reusing `classifyFile` as an L08 prompt filter.
- Finding markers in Original order (it stays the unchanged DiffViewer, per decision 3).
- For the architecture reviewer: the generic `DiffAnnotationApi` in the shared diff-viewer, and the smart-diff module with no repository.
- For the security reviewer: the new GET route (workspace-scoped via `getPull`, read-only, no rate-limit config of its own).

## Open questions
- Toggle default: the plan shows finding comments by default when active findings exist (`showOverride ?? findings>0`). Keep it, or keep everything hidden until the user clicks "Show comments" (flow 09 would then need a click)?
- Should the group-header file count also appear when a group is collapsed? Collapse is per file card, not per group, which is how the plan reads "docs and boilerplate collapsed by default".


## Amendments (agreed 2026-10-08, before implementation)
- **Group-level collapse (overrides "collapse per file card").** Each `SmartGroupHeader` has a chevron and toggles its whole group (as in the prototype). Groups `docs` and `boilerplate` start collapsed; a collapsed group shows only its header with the role label, the files-with-findings counter and "N files". Inside an expanded group, file cards keep the existing `AUTO_EXPAND_MAX_LINES` rule (`defaultOpen` on FileCard is still useful for that, but no longer required for docs/boilerplate). Group open state lives in component state (not the URL). Add RTL cases: boilerplate group collapsed on mount (no file paths rendered), clicking its header reveals `pnpm-lock.yaml`; counter visible while collapsed.
- **Group header subtitle (prototype).** Each role label is followed by a muted one-line description from i18n (`smartDiff.<role>Hint`, e.g. core "The substance of the change — review closely", tests "Proves the change works", wiring "Hooks the core into the app", docs "Explains the change", boilerplate "Generated / mechanical — skim").
- **Open question 1 → keep the plan:** finding comments are shown by default when active findings exist (tri-state toggle).
- **Open question 2 → resolved by the first amendment.**
- **Spec name:** `specs/L03e-smart-diff.md` accepted (README numbers Smart Diff under L03).
