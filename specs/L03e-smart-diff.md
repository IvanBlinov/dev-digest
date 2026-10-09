# Smart Diff (reviewer-ordered Files changed tab)

## Goal
On a PR's **Files changed** tab, files are grouped by role in the order core, tests, wiring, docs,
boilerplate. Each group header shows the role, a one-line hint, how many of its files have active
findings, and "N files". Under each finding's line the tab shows an inline finding comment (accept
or dismiss) and the line gets a severity bar. A "Smart order | Original order" toggle switches back
to GitHub order (`?order=original`).

## Scope
- In: the role classifier, `GET /pulls/:id/smart-diff`, the seed that makes PR #482 show all five
  groups, and the client tab (group headers, finding annotations, toggle). Group headers collapse
  as a whole; `docs` and `boilerplate` start collapsed.
- Out: LLM `pseudocode_summary`, real `proposed_splits` / `too_big`, reusing `classifyFile` as an
  L08 prompt filter, finding markers in Original order.
- Naming: the README numbers Smart Diff under lesson L03 (L04 is MCP / Blast Radius), so this spec
  is `L03e-smart-diff.md`, not `L04-smart-diff.md`.

## Contracts
- `SmartDiffRole` in `@devdigest/shared` (`contracts/brief.ts`, both copies) widens from
  `core | wiring | boilerplate` to `core | tests | wiring | docs | boilerplate`. Declaration order is
  display order.
- `SmartDiffResponse` (`contracts/review-api.ts`) is unchanged (it is `SmartDiff`).
- Route `GET /pulls/:id/smart-diff` returns `SmartDiffResponse`: groups in role order (empty roles
  omitted); `finding_lines` = sorted unique `start_line`s of non-dismissed findings from the newest
  `kind='review'` review of each agent; `split_suggestion = {too_big:false, total_lines:sum(add+del),
  proposed_splits:[]}`. No LLM call. Unknown PR gives 404. Works before any review.
- Classifier rule order (first match wins, default `core`): boilerplate, tests, wiring, docs, core.
  Consequence of the order: `e2e/README.md` is classified as **tests** (the `e2e/` tests rule fires
  before the docs rule). Directory patterns match any path segment, so `src/build/x.ts` is
  boilerplate; tighten the data in `server/src/modules/smart-diff/constants.ts` if that bites.

## Per-package work
- server: `modules/smart-diff/{constants,helpers,service,routes}.ts` (no repository: reads reuse
  `ReviewRepository`); seed PR #482 with 9 files and small patches (fresh DB needed, the insert is
  guarded by "PR exists"). The seeded patches also feed `diff-loader`'s `pr_files` fallback.
- client: `useSmartDiff` hook (`["smart-diff", prId]`, invalidated when a run finishes), generic
  `DiffAnnotationApi` in `diff-viewer`, `DiffTab` helpers, `SmartGroupHeader`, i18n under
  `prReview.smartDiff`.
- reviewer-core: none.
- e2e: `e2e/specs/09-smart-diff.flow.json`.

## Acceptance criteria
- [ ] AC1 `classifyFile(path)` applies the rules in order and imports no HTTP or container code
- [ ] AC2 `GET /pulls/:id/smart-diff` returns a Zod-valid response, role-ordered, newest review per agent, no LLM, 404 for unknown PR
- [ ] AC3 The tab header reads "Reviewer-ordered diff · N files · +A -D"; groups appear in role order with role label and "N files"; `docs` and `boilerplate` groups start collapsed; a lock file lands in boilerplate
- [ ] AC4 After a review a group header shows a red dot and the count of files with active findings; before any review it shows "Review not run yet" and no counters
- [ ] AC5 A file card header shows a dot (no number) when the file has active findings, separate from the GitHub comment counter
- [ ] AC6 A finding renders as a `FindingCard` under line `RIGHT:${start_line}` with a severity bar and label; findings outside the patch go to a "Findings outside the diff" block; dismissed findings render muted with no bar, dot or count
- [ ] AC7 The comments toggle hides finding comments too
- [ ] AC8 `?order=original` renders today's `DiffViewer` unchanged; smart order is the default; the toggle writes and clears the URL param
- [ ] AC9 Accept/Dismiss updates counters and dots without reload; a finished run invalidates `["smart-diff", prId]`
- [ ] AC10 Every new string comes from `prReview.smartDiff`

## Links
- Plan: [plans/2026-10-08-smart-diff.md](plans/2026-10-08-smart-diff.md)
- [../README.md](../README.md) lesson table; [../server/INSIGHTS.md](../server/INSIGHTS.md) (`pickLatestPerAgent` rule); [../client/INSIGHTS.md](../client/INSIGHTS.md)

## Delivery notes

### Subagents and roles
| Stage | Subagent | What it did |
|---|---|---|
| Plan | `planner` (opus) | Read the homework brief plus agreed decisions and produced the 12-step plan. It caught that the spec belongs under L03 (`README.md:84`), reused `pickLatestPerAgent`/`activeFindings` as the one "latest findings" rule, and designed a generic annotation API so the shared diff-viewer never imports route components. The main session added Amendments (group-level collapse, role hints) before implementation. |
| Implement S0–S4 | `implementer` (sonnet), session 1 | Spec, `SmartDiffRole` widened in both `brief.ts` copies, pure `classifyFile`/`buildSmartDiff` with a 31-case path→role table, `GET /pulls/:id/smart-diff`, and seed patches for PR #482 (9 files, +247/−38). |
| Implement S5–S10 | `implementer` (sonnet), session 2 | `useSmartDiff`, diff-viewer annotations (dot, line marker, inline card, outside-diff block), `SmartGroupHeader`, `DiffTab` with the Smart/Original toggle. |
| Implement fix + S11–S12 | `implementer` (sonnet), session 3 | Finding cards expanded by default in the diff (P1), e2e flow `09-smart-diff`, docs and insights. |
| Review | `architecture-reviewer` (sonnet) ∥ `plan-verifier` (sonnet) | Run in parallel from `scripts/diff-digest.sh`. Architecture: clean (16 boundary rules, 0 findings). |

Each implementer session started with a fresh context and handed over through `.claude/handoff/smart-diff/evidence.jsonl`, a log of every check run, tied to a fingerprint of the working tree.

### Plan-verifier findings
- **Verdict: all met, no P1 gap.** AC1–AC10, S1–S12 and every homework P1 item map to a passing test.
- **Re-run by the verifier itself:** server typecheck, server unit tests 454/454, client tests 317/317, e2e typecheck, the `brief.ts` mirror check, and on fresh DBs `smart-diff.it` 5/5, `reviews-intent.it` 8/8, `reviews.it` 8/8 and `intent.it` 8/8.
- **Accepted from the evidence log:** `pnpm build`, because the log entry's fingerprint matched the current tree.
- **Cannot verify:** flow 09 in a real browser, because the `agent-browser` CLI is not installed. The browser-only parts of AC3, AC6 and AC8, including the URL write for "Original order", are covered by RTL tests and the demo video.
- **Gaps noted:** the Delivery notes were empty, which is fixed here. Some supporting files were not named in the plan: `useFindingAnnotations.tsx`, the styles files and the hooks barrel.

### Deviations
- **Spec name:** `L03e` instead of the requested L04, because the course README numbers Smart Diff under L03.
- **Extra classifier patterns:** more lock files, `.map`, `build`/`node_modules`/`.next`/`coverage`, `Dockerfile`, `.gitignore`, `scripts/` and `specs/`. `vendor/` is deliberately left as core. All patterns live in `server/src/modules/smart-diff/constants.ts`.
- **`package.json` → wiring.** The prototype shows it as boilerplate. A dependency manifest is worth reading, and the test table records the choice.
- **Collapse is per group, not per file card:** docs and boilerplate groups start collapsed, as in the prototype.
- **"Review not run yet"** is shown once under the diff header, not in every group.
- **Default comment visibility** counts dismissed findings too, so dismissing the last finding keeps its muted card visible.
- **Tests use `fireEvent`,** because `@testing-library/user-event` is not installed.
