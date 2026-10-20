# Development Plan: Onboarding Generator, Plan 2 of 2 (client + e2e + demo)

**Spec:** specs/L05b-onboarding-generator.md (SPEC-02, approved) · **Base commit:** ebdcbd8
**Packages:** client, e2e · **Size:** L (16 steps; ~24 KB, because test-writer needs exact red-phase cases and component APIs)
**Execution mode:** multi (chosen by the user 2026-10-19) · **Red phase:** test-writer — S1, S2, S3, S4, S5, S6, S7, S8, S9, S10, S11, S12, S13
**Gate slug:** `l05b-onboarding-plan-2` · **`R`** = `client/src/app/repos/[repoId]/onboarding`

Approved by the user 2026-10-19 (Q1 = B; R1–R7 adopted as planner choices). Revised 2026-10-20 after the cross-model review ([review](2026-10-19-l05b-onboarding-plan-2-review.md); rows 1, 5, 7 accepted → S1, S2, S12, S13, S14).

## Goal
On `/repos/:repoId/onboarding` the user reads the five-section tour, generates or regenerates it (one model call), sees an honest status, staleness and cost, and copies commands, a share link or Markdown. Plan 1's server answers the requests. The seeded tour renders in e2e with no model call.

## Acceptance criteria (from the spec, unchanged)
- AC-46 (nav item + `g o`) → `vendor/ui/nav.test.ts`, `app-shell/hooks/useGlobalShortcuts.test.tsx` · S3
- AC-47 (`/onboarding` stays Add-repo; active only on the tour) → `app-shell/helpers.test.ts`; flow 06 · S3, S14
- AC-48 (breadcrumb, title) → `TourHeader.test.tsx`, `OnboardingTourView.test.tsx` · S10, S13
- AC-49 (subtitle) → `TourHeader.test.tsx` · S10
- AC-50 (not cloned, no tour: refresh, not resync) → `helpers.test.ts`, `NotClonedState.test.tsx`, view test · S4, S12, S13
- AC-51 (not cloned, tour: Regenerate disabled) → `helpers.test.ts`, `TourActions.test.tsx`, flow 11 · S4, S11, S14
- AC-52, AC-53 (none / generating, poll 2 s) → `hooks/onboarding.test.tsx`, `TourActions.test.tsx`, view test · S1, S11, S13
- AC-54 (POST, 409 → poll, 429 message) → hook test, `TourActions.test.tsx`, view test · S1, S11, S13
- AC-55 (ON THIS PAGE, current section, anchor scroll) → `helpers.test.ts`, `TourToc.test.tsx` · S4, S9
- AC-56, AC-59 (collapsible card, Deterministic chip, unavailable) → `SectionCard.test.tsx` · S6
- AC-57 (stale badge) → `TourActions.test.tsx` · S11
- AC-58 (failed banner) → `TourHeader.test.tsx` · S10
- AC-60 (Open on GitHub) → `helpers.test.ts`, `CriticalPathsSection.test.tsx` · S4, S7
- AC-61 (commands, copy, script tooltip) → `RunCommandsSection.test.tsx`, view test · S8, S13
- AC-62 (reading path rows) → `ReadingPathSection.test.tsx` · S8
- AC-63 (first-task rows) → `FirstTasksSection.test.tsx` · S9
- AC-64, AC-65 (share link, Markdown) → `helpers.test.ts`, `use-copy-to-clipboard.test.tsx`, view test · S4, S11, S13
- AC-66 (footnote) → `TourHeader.test.tsx` · S10
- AC-67 (Markdown with skipHtml, no images, no URL links; plain text for repo text) → `TourMarkdown.test.tsx`, `TruncatedText.test.tsx`, section tests · S5, S7, S8
- AC-68 (load error + Retry) → hook test, view test · S1, S13
- UI parts of AC-27, AC-29, AC-34, AC-37, AC-39, AC-40 → section tests · S7–S9
- AC-70 (e2e part) → `e2e/specs/11-onboarding-tour.flow.json` · S14
- AC-72 (demo) → manual checklist and log gate · S16
- NFR-6 → every test above. NFR-7 → `NFR-7:` cases in S6, S11. NFR-8 → S2 test and the matrix `rg` check.

## Requirements decisions
| # | Question / recommendation | Decision | Effect on the plan |
|---|---|---|---|
| Q1 | `failed` with no tour (first generation interrupted, `server/src/modules/onboarding/repository.ts:103-109`) | B (user, 2026-10-19): the AC-52 view plus "Last generation failed: <reason>"; tests tagged `Q1:` | S4 view mode `empty`; S2 key `lastFailed`; S13 test |
| R1 | Diagram display | Existing `MermaidDiagram` (`securityLevel: "strict"`, `client/src/components/mermaid-diagram/MermaidDiagram.tsx:37`) fed by a pure `diagramToMermaid` with generated ids `n0…` and labels filtered to `[A-Za-z0-9 _./@-]` | S4, S7 |
| R2 | Markdown | Local `TourMarkdown` (`skipHtml`, `disallowedElements=["img","a"]`, `unwrapDisallowed`); known paths linked only from inline code. The shared `Markdown` renders `<a href>` (`client/src/vendor/ui/primitives/Markdown.tsx:36`) | S5 |
| R3 | Global mutation toast | 409 `onboarding_generation_running` and 429 resolve as outcomes inside `mutationFn` (`client/src/lib/providers.tsx:42`) | S1 |
| R4 | NFR-8 and the sidebar | Sidebar and shortcut-help labels stay English config in `vendor/ui/nav.ts`, like every other item (`client/src/vendor/ui/shell/NavItem.tsx:54`) | S3 |
| R5 | `no_clone` in AC-41 but not in `OnboardingReason` (`server/src/vendor/shared/contracts/onboarding.ts:8-18`) | Reported for the record; the client adds the label anyway; no contract change | S2 |
| R6 | AC-50 | Poll GET every 2 s until `cloned` is true (`useRefreshRepo` does not invalidate onboarding, `client/src/lib/hooks/core.ts:82`) | S1, S12, S13 |
| R7 | AC-66 | ICU plural for calls; `formatUsd` for cost (`client/src/lib/format-usd.ts:7`) | S2, S10 |
| Review 1 | Real index status in the not-cloned state (cross-model review row 1, accepted 2026-10-20) | `NotClonedState` renders the real `GET /repos/:id/index-state` result (`full`, `partial`, `degraded` with or without `no_data`, `failed`, plus loading and error); "Clone and index" calls `useRefreshRepo().mutate` (`POST /repos/:id/refresh`), never resync | S1, S2, S12, S13 |
| Review 5 | No model call in e2e (row 5, accepted partly) | Flow 11 proves no "Generate onboarding tour" control is shown; the model-name wait stays | S14 |
| Review 7 | Bounded clone poll (row 7, accepted) | Stops on `cloned`, on refresh error, on unmount/repo change, and after `ONBOARDING_CLONE_POLL_MAX_MS = 600_000` with a "still cloning" note; fake-timer tests | S1, S2, S12, S13 |

## Key constraints
| Source (file:line) | Rule or insight | Effect on this plan |
|---|---|---|
| `client/src/components/app-shell/helpers.ts:29` | `includes("/onboarding")` marks the Add-repo screen active | S3 replaces it with an anchored `/^\/repos\/[^/]+\/onboarding(\/\|$)/` match |
| `client/src/lib/providers.tsx:42` | Every mutation error is toasted globally | S1 resolves 409-running and 429 into outcomes; other errors still throw and toast |
| `client/src/vendor/ui/primitives/Markdown.tsx:10,36` | The shared Markdown renders links and images | S5 adds a local `TourMarkdown` |
| `client/INSIGHTS.md` (2026-09-29) | A value import from `@devdigest/shared` breaks `next build` | `import type` only; reason lists are local constants typed `satisfies readonly OnboardingReason[]` |
| `client/INSIGHTS.md` (2026-10-08), `vendor/ui/primitives/SectionLabel.tsx:22` | `SectionLabel` uppercases, so e2e cannot match its text | Card titles are plain `<h2>`; e2e waits on card content |
| `client/src/test/setup.ts:3-9` | jsdom has no IntersectionObserver or scrollIntoView | S9 guards `typeof IntersectionObserver`; tests stub both |
| `server/src/modules/repo-intel/service.ts:189-204` | A repo with no index returns `degraded` / `no_data`, never 404 | S12 labels it "not indexed" |
| `server/src/db/seed.ts:171`, `server/src/db/seed-onboarding.ts:20` | The seeded repo has `clonePath` null and a `ready` tour with 5 known paths | Flow 11 sees the AC-51 view; no Generate control, so no model call |
| `client/src/lib/github-urls.ts:24` | `githubBlobUrl` already encodes each path segment | S4 `fileHref` reuses it (AC-60) |
| `client/src/lib/hooks/conventions.ts:17,30-37` | The poll-while-running hook pattern | S1 copies it |

## Constraints hit
- **vendor/shared:** no contract change. `diff` of `contracts/onboarding.ts` must stay empty. R5 is reported, not edited.
- **Server, reviewer-core, mcp:** not touched.
- **No new dependency:** `react-markdown`, `remark-gfm`, `mermaid`, `lucide-react` (`Compass`) and `@testing-library/user-event` are already in `client/package.json`.
- `next build` must not run while `next dev` serves `client/` (`client/INSIGHTS.md` 2026-09-30).

## Contract & data changes
| Contract / table | Before → after | Optional/nullable choice | Consumers to update |
|---|---|---|---|
| none (`OnboardingTourState`, `OnboardingTour`, `OnboardingReason`, `OnboardingGenerateResponse` consumed as types) | — | — | new hook `client/src/lib/hooks/onboarding.ts` |
| `client/messages/en/onboarding.json` | stale keys → the S2 key set | — | every S5–S13 component |

## Steps

### S1 — Onboarding hooks  [package: client · layer: hook] (red phase)
- **Skills:** frontend-architecture, react-best-practices, react-testing-library, test-strategy
- **Files:** create `client/src/lib/hooks/onboarding.ts`; modify `client/src/lib/hooks/index.ts` (add `export * from "./onboarding"`).
- **API (pinned for test-writer):**
  - `ONBOARDING_POLL_MS = 2000`; `ONBOARDING_CLONE_POLL_MAX_MS = 600_000`; `onboardingKey(repoId) = ["onboarding", repoId]`; `isTourGenerating(state)`.
  - `useOnboardingTour(repoId, opts?: { pollUntilCloned?: boolean })` returns the `useQuery` result on `GET /repos/:id/onboarding`, spread together with `clonePollTimedOut: boolean`.
    - It polls every 2000 ms while `status==="generating"`.
    - It also polls every 2000 ms while `pollUntilCloned` is true, `cloned` is false, and less than `ONBOARDING_CLONE_POLL_MAX_MS` has passed since `pollUntilCloned` last became true for this `repoId`.
    - The window start is kept in a ref; it resets when `repoId` changes or `pollUntilCloned` turns false.
    - `clonePollTimedOut` becomes true when the window runs out and `cloned` is still false.
    - Unmounting stops polling (React Query clears the interval).
  - `useGenerateOnboarding(repoId)`: `useMutation` resolving `"started" | "running" | "rate_limited"`. On `started`/`running` it writes `{...prev, status:"generating"}` (keeping `tour`) into the cache and invalidates the key; on `rate_limited` the cache is unchanged.
- **Test first:** `client/src/lib/hooks/onboarding.test.tsx` (pattern of `blast.test.tsx:7-26`, keep the real `ApiError`: `vi.mock("../api", async (o) => ({ ...(await o()), api: { get: vi.fn(), post: vi.fn() } }))`; `vi.useFakeTimers({ shouldAdvanceTime: true })` wherever time matters):
  - "AC-68: a rejected GET surfaces as isError"; "GETs /repos/r1/onboarding".
  - "AC-53: refetches every 2000 ms while generating and stops after ready".
  - "AC-50: pollUntilCloned polls every 2000 ms while cloned is false and stops once cloned".
  - "AC-50: pollUntilCloned false → no polling while cloned is false".
  - "R6: the clone poll stops after ONBOARDING_CLONE_POLL_MAX_MS (600000) and clonePollTimedOut becomes true" (advance 600 000 ms, then 10 000 ms more: no further GETs).
  - "R6: the clone poll stops on unmount" (after unmount, advancing 10 000 ms adds no GET).
  - "R6: a repo change moves the poll" (rerender with `r2`: GETs go to `/repos/r2/onboarding`, `r1` gets no more, the window restarts for `r2`).
  - "AC-50: useRefreshRepo (from ./core) mutate('r1') posts /repos/r1/refresh and never /repos/r1/resync" (tests the existing hook at `client/src/lib/hooks/core.ts:82`).
  - "AC-54: 202 → 'started', cached status generating, tour kept".
  - "AC-54: 409 onboarding_generation_running → 'running', cached status generating, no rejection".
  - "AC-54: 429 → 'rate_limited', cache unchanged, no rejection".
  - "409 repo_not_cloned → the mutation rejects".
  - "EC-14: onboardingKey differs per repo".
- **Verify:** `scripts/gate.sh l05b-onboarding-plan-2 S1 -- "cd client && pnpm exec vitest run src/lib/hooks/onboarding.test.tsx && pnpm typecheck"`
- **Depends on:** —
- **Done when:** the hook parts of AC-50, AC-53, AC-54 and AC-68, and the R6 bounded poll.

### S2 — i18n namespace  [package: client · layer: messages] (red phase)
- **Skills:** frontend-architecture (i18n), test-strategy
- **Files:** replace `client/messages/en/onboarding.json` (ASCII apostrophe in "Couldn't"); create `R/messages.test.ts`.
- **Keys (camelCase; English exactly as the spec gives it):**
  - `breadcrumb` "Onboarding Tour"; `title` "Onboarding for {name}".
  - `subtitle`: `coverage` "Generated from index of {count} files"; `coveragePartial` "Generated from index of {count} of {total} files (partial)"; `coveragePartialNoTotal` "Generated from index of {count} files (partial)"; `generatedAt` "generated {when}"; `indexAt` "index {when}" (joined with " · ").
  - `footnote` "{model} · {calls, plural, one {# call} other {# calls}} · {cost}"; `costUnknown` "cost unknown".
  - `actions`: `generate` "Generate onboarding tour"; `generateNote` "Makes one model call"; `regenerate` "Regenerate"; `generating` "Generating…"; `cloneToRegenerate` "Clone the repository to regenerate"; `share` "Share link"; `copyMarkdown` "Copy as Markdown"; `rateLimited` "Too many generations — try again in a minute"; `lastFailed` "Last generation failed: {reason}".
  - `copy`: `linkCopied` "Link copied"; `markdownCopied` "Markdown copied"; `commandCopied` "Command copied"; `failed` "Couldn't copy to the clipboard"; `copyCommand` "Copy {command}"; `openPath` "Open {path}"; `open` "Open".
  - `stale`: `badge` "Stale"; `index_moved` "Index moved since this tour"; `prompt_changed` "Tour format changed".
  - `failedBanner` "Regeneration failed {when}: {reason} — showing the tour from {tourWhen}".
  - `toc.title` "On this page".
  - `sections`: `architecture` "Architecture overview", `criticalPaths` "Critical paths", `runCommands` "How to run locally", `readingPath` "Guided reading path", `firstTasks` "First tasks".
  - `card`: `deterministic` "Deterministic"; `unavailable` "Unavailable: {reason}"; `collapse` "Collapse {title}"; `expand` "Expand {title}".
  - `empty`: `diagramUnavailable` "Diagram unavailable"; `noCommands` "No run commands found in package.json, compose files or Makefile"; `noGraph` "Not available: the import graph covers JS/TS sources only"; `noTasks` "First tasks are written by the narrative step — Regenerate to try again".
  - `notCloned`: `title` "Clone and index this repository to generate a tour"; `index` "Index status: {status}"; `cta` "Clone and index"; `requested` "Clone requested — this page updates when it finishes"; `stillCloning` "Still cloning — refresh the page to check"; `failed` "Couldn't start the clone — try again".
  - `noRepo`: `title` "Add a repository to see its onboarding tour"; `cta` "Add repository".
  - `loadError`: `title` "Couldn't load the onboarding tour"; `retry` "Retry".
  - `reasons.<code>` (all 10 AC-41 codes): `no_clone` "Repository not cloned", `index_degraded` "Index unavailable", `index_partial` "Index partial", `no_graph` "No import graph", `llm_timeout` "Model timed out", `llm_error` "Model error", `invalid_output` "Invalid model output", `no_api_key` "No API key configured", `budget_trimmed` "Input trimmed to fit the budget", `interrupted` "Interrupted".
  - `indexStatus`: `full` "indexed", `partial` "partially indexed", `degraded` "degraded", `notIndexed` "not indexed", `failed` "index failed", `loading` "checking…", `unknown` "unavailable".
- **Test first:** `R/messages.test.ts`: "NFR-8: the stale `generate.body` key is gone"; "NFR-8: reasons has a label for every AC-41 code (10)"; "NFR-8: sections has the five titles in spec order"; "NFR-8: indexStatus covers full, partial, degraded, notIndexed, failed, loading and unknown; notCloned has requested, stillCloning and failed".
- **Verify:** `scripts/gate.sh l05b-onboarding-plan-2 S2 -- "cd client && pnpm exec vitest run onboarding/messages.test && pnpm typecheck"`
- **Depends on:** —
- **Done when:** the NFR-8 namespace exists.

### S3 — Sidebar item, `g o`, active key  [package: client · layer: shell] (red phase)
- **Skills:** frontend-architecture, react-best-practices, react-testing-library, test-strategy
- **Files:** `client/src/vendor/ui/nav.ts:25` (after `pulls`: `{ key:"onboarding-tour", label:"Onboarding Tour", icon:"Compass", href:"/repos/:repoId/onboarding", gKey:"o" }`); `nav.ts:61` (`{ keys:"g o", label:"Go to Onboarding Tour", group:"Navigation" }`); `client/src/vendor/ui/icons.tsx` (lucide `Compass`); `client/src/components/app-shell/helpers.ts:29`.
- **Test first:**
  - `client/src/vendor/ui/nav.test.ts`: "AC-46: WORKSPACE = [pulls, onboarding-tour] with label, href '/repos/:repoId/onboarding', gKey 'o'"; "AC-46: SHORTCUTS has 'g o'; g-keys stay unique".
  - new `client/src/components/app-shell/helpers.test.ts`: "AC-47: activeKeyFor('/onboarding') === ''"; "AC-47: activeKeyFor('/repos/r1/onboarding') === 'onboarding-tour'"; "'/repos/r1/pulls' stays 'pulls'".
  - new `client/src/components/app-shell/hooks/useGlobalShortcuts.test.tsx` (mock `next/navigation`, `../../../lib/repo-context`): "AC-46: keydown g then o → push('/repos/r1/onboarding')"; "g o typed inside an input does nothing".
- **Verify:** `scripts/gate.sh l05b-onboarding-plan-2 S3 -- "cd client && pnpm exec vitest run src/vendor/ui/nav.test.ts src/components/app-shell && pnpm typecheck"`
- **Depends on:** —
- **Done when:** AC-46, AC-47.

### S4 — Route constants and pure helpers  [package: client · layer: route helpers] (red phase)
- **Skills:** frontend-architecture, test-strategy
- **Files:** create `R/constants.ts`, `R/helpers.ts`, `R/helpers.test.ts`. test-writer also creates `R/test-fixtures.ts`: `REPO` = `{ id:"r1", owner:"acme", name:"payments-api", full_name:"acme/payments-api", default_branch:"main", clone_path:null, … }`; `tour(over?)` (ready tour, content as `server/src/db/seed-onboarding.ts:20-96`); `tourState(over?)`.
- **API:** `TOUR_SECTIONS` (ordered `{ key, anchor, titleKey }` for `architecture-overview`, `critical-paths`, `how-to-run-locally`, `guided-reading-path`, `first-tasks`); `isTourAnchor(hash): anchor | null`; `tourViewMode({ repoKnown, isLoading, isError, data })` → `"no_repo" | "loading" | "load_error" | "not_cloned" | "empty" | "generating" | "tour"`; `fileHref(repo, indexSha, path)`; `diagramToMermaid(diagram)`; `tourToMarkdown(tour, { repoName, titles, reasonLabel })`.
- **Test first:** `R/helpers.test.ts`:
  - "AC-55: isTourAnchor accepts the five anchors only ('#evil', '', '#Architecture-overview' → null)".
  - "AC-50: cloned false + tour null → not_cloned"; "AC-51: cloned false + tour → tour"; "AC-52: none + cloned → empty".
  - "AC-53: generating → generating, even with a stored tour".
  - "AC-68: isError → load_error"; "EC-1: repo unknown → no_repo"; "Q1: failed + tour null + cloned → empty"; "AC-58: failed + tour → tour".
  - "AC-60: fileHref uses index_sha, else default_branch, and encodes segments" (`src/a b/c#.ts` → `…/blob/main/src/a%20b/c%23.ts`).
  - "AC-28: diagramToMermaid → `graph LR`, ids n0…, quoted labels; a label `x"]; click n0 evil` is sanitized; edges to unknown ids are dropped; service nodes use `[(…)]`".
  - "AC-65: tourToMarkdown → `# Onboarding for payments-api`; five `## ` headings in order; paths in backticks; one `sh` code block with the commands in order (comment as ` # …`); tasks as `- **title** — description (`path`)`; an unavailable section → `_Unavailable: <label>_`".
- **Implement:** `fileHref` calls `githubBlobUrl(repo.full_name, indexSha ?? repo.default_branch, path)` (`client/src/lib/github-urls.ts:24`).
- **Verify:** `scripts/gate.sh l05b-onboarding-plan-2 S4 -- "cd client && pnpm exec vitest run onboarding/helpers.test && pnpm typecheck"`
- **Depends on:** —
- **Done when:** logic parts of AC-50–AC-53, AC-55, AC-58, AC-60, AC-65 and the AC-28 display.

### S5 — `TourMarkdown` and `TruncatedText`  [package: client · layer: component] (red phase)
- **Skills:** frontend-architecture, react-best-practices, react-testing-library, security, test-strategy
- **Files:** `R/_components/TourMarkdown/{TourMarkdown.tsx,index.ts,TourMarkdown.test.tsx}`, `R/_components/TruncatedText/{TruncatedText.tsx,index.ts,styles.ts,TruncatedText.test.tsx}`.
- **API:** `TourMarkdown({ text, knownPaths, hrefFor, inline? })` — react-markdown + `remarkGfm`, `skipHtml`, `disallowedElements={["img","a"]}`, `unwrapDisallowed`; an inline `code` whose text is in `knownPaths` becomes `<a href={hrefFor(p)} target="_blank" rel="noopener noreferrer">`; with `inline`, `p` renders as `span`. `TruncatedText({ text, tooltip?, mono? })` — `<span tabIndex={0}>` with ellipsis CSS, `title`, `aria-describedby`; hover/focus shows `<span role="tooltip">` with the plain tooltip text (default `text`).
- **Test first:**
  - TourMarkdown: "AC-67: `<script>alert(1)</script>` → no script element, and the text is not rendered as HTML"; "AC-67: `![x](http://e/i.png)` → no img element"; "AC-67: `[l](http://evil)` and a bare `http://bare.example` → no link; the text 'l' remains"; "AC-40: `` `src/a.ts` `` with knownPaths [src/a.ts] → link to hrefFor('src/a.ts') with target _blank and rel 'noopener noreferrer'; `` `src/zzz.ts` `` → no link"; "AC-67: **bold** → strong".
  - TruncatedText: "EC-19: focus shows the full value in role tooltip; blur hides it; mouseenter shows it"; "AC-67: text `<b>x</b>` is shown literally".
- **Verify:** `scripts/gate.sh l05b-onboarding-plan-2 S5 -- "cd client && pnpm exec vitest run onboarding/_components/TourMarkdown onboarding/_components/TruncatedText && pnpm typecheck"`
- **Depends on:** S2
- **Done when:** AC-67 and the AC-40 rendering rule; EC-19.

### S6 — `SectionCard`  [package: client · layer: component] (red phase)
- **Skills:** frontend-architecture, react-best-practices, react-testing-library, test-strategy
- **Files:** `R/_components/SectionCard/{SectionCard.tsx,index.ts,styles.ts,SectionCard.test.tsx}`.
- **API:** `SectionCard({ anchor, title, source, unavailableReason, children })` — `<section id={anchor} aria-labelledby>` with a plain `<h2>` (not `SectionLabel`); `<button aria-expanded aria-controls>` named `Collapse <title>` / `Expand <title>`; `Chip` "Deterministic" when `source==="deterministic"`; line `card.unavailable` with the reason label; collapse state `useState(true)` only.
- **Test first:** "AC-56: expanded by default (aria-expanded true); click → false and the body is not rendered; Enter and Space on the focused button toggle it"; "AC-56 / NFR-7: name 'Collapse Critical paths' → 'Expand Critical paths'"; "AC-56: a remount is expanded again; no localStorage write (spy)"; "AC-59: deterministic → 'Deterministic'; llm → no chip"; "AC-59: index_degraded → 'Unavailable: Index unavailable'"; "AC-55: section has id = anchor and a level-2 heading with the title".
- **Verify:** `scripts/gate.sh l05b-onboarding-plan-2 S6 -- "cd client && pnpm exec vitest run onboarding/_components/SectionCard && pnpm typecheck"`
- **Depends on:** S2
- **Done when:** AC-56, AC-59.

### S7 — Architecture and Critical paths sections  [package: client · layer: component] (red phase)
- **Skills:** frontend-architecture, react-best-practices, react-testing-library, security, test-strategy
- **Files:** `R/_components/ArchitectureSection/*`, `R/_components/CriticalPathsSection/*` (component, index, test, styles).
- **API:** `ArchitectureSection({ section, knownPaths, hrefFor })` — narrative via `TourMarkdown`; diagram via `MermaidDiagram` from `@/components/mermaid-diagram` (mocked in tests); diagram null → `empty.diagramUnavailable` + the label of `unavailable_reason ?? "no_graph"`. `CriticalPathsSection({ section, knownPaths, hrefFor })` — per row: path (`TruncatedText`), fact as plain text, reason (`TourMarkdown inline`) when non-null, `<a>` "Open" with `aria-label="Open <path>"`, `target="_blank"`, `rel="noopener noreferrer"`.
- **Test first:** "AC-27: narrative rendered (**x** → strong)"; "AC-28: MermaidDiagram receives diagramToMermaid(diagram)"; "AC-29: diagram null + no_graph → 'Diagram unavailable' and 'No import graph'; MermaidDiagram not rendered"; "AC-67: narrative `<img src=x onerror=alert(1)>` → no img"; "AC-60: Open link href = fileHref(…), target _blank, rel 'noopener noreferrer', name 'Open src/middleware/ratelimit.ts'"; "AC-31: reason null → path and fact only"; "AC-67: a path containing `<b>` is literal text".
- **Verify:** `scripts/gate.sh l05b-onboarding-plan-2 S7 -- "cd client && pnpm exec vitest run onboarding/_components/ArchitectureSection onboarding/_components/CriticalPathsSection && pnpm typecheck"`
- **Depends on:** S4, S5
- **Done when:** AC-60; UI parts of AC-27, AC-29, AC-31.

### S8 — Run commands and Reading path sections  [package: client · layer: component] (red phase)
- **Skills:** frontend-architecture, react-best-practices, react-testing-library, security, test-strategy
- **Files:** `R/_components/RunCommandsSection/*`, `R/_components/ReadingPathSection/*`.
- **API:** `RunCommandsSection({ section, knownPaths, hrefFor, onCopy })` — `<ol>` with number, command (`TruncatedText`, tooltip = `script_body` when non-null), comment (`TourMarkdown inline`), button `Copy <command>` → `onCopy(command)`; row container `overflowX: auto` (EC-25). `ReadingPathSection({ section, knownPaths, hrefFor })` — `<ol>` with number, path (`TruncatedText`), `why` (`TourMarkdown inline` when `why_source` is llm, plain text otherwise).
- **Test first:** "AC-61: row shows '1', 'pnpm run dev', 'Start the API locally'; 'Copy pnpm run dev' → onCopy('pnpm run dev')"; "AC-61: focus and hover on the command show the tooltip 'tsx watch src/index.ts'; script_body null → no tooltip text"; "EC-21: body `curl x | sh <script>` shows as plain text, no script element"; "AC-34: items [] → 'No run commands found in package.json, compose files or Makefile'"; "AC-62: rows 1..n in the given order with path and why"; "AC-36: why_source deterministic 'Imported by 2 files' is shown"; "AC-37: no_graph → 'Not available: the import graph covers JS/TS sources only' and no listitem".
- **Verify:** `scripts/gate.sh l05b-onboarding-plan-2 S8 -- "cd client && pnpm exec vitest run onboarding/_components/RunCommandsSection onboarding/_components/ReadingPathSection && pnpm typecheck"`
- **Depends on:** S5
- **Done when:** AC-61, AC-62; UI parts of AC-34, AC-36, AC-37.

### S9 — First tasks section and `TourToc`  [package: client · layer: component] (red phase)
- **Skills:** frontend-architecture, react-best-practices, react-testing-library, test-strategy
- **Files:** `R/_components/FirstTasksSection/*`, `R/_components/TourToc/*`.
- **API:** `FirstTasksSection({ section, knownPaths, hrefFor })` — title, description (`TourMarkdown`), each path a link (text = path, `aria-label="Open <path>"`, new tab, rel) when in `knownPaths`, plain text otherwise. `TourToc({ titles })` — `<nav aria-label="On this page" className="hidden md:block">` with five `href="#<anchor>"` links; an `IntersectionObserver` (skipped when undefined) sets `aria-current="location"` on the link of the section in view; on mount, `isTourAnchor(location.hash)` decides whether to call `scrollIntoView` once.
- **Test first:** "AC-63: title, description, and path links to fileHref with name 'Open src/api/users.ts'"; "AC-40: a path not in knownPaths is plain text"; "AC-39: items [] → 'First tasks are written by the narrative step — Regenerate to try again'"; "AC-55: five links in spec order with the five hrefs"; "AC-55: an intersecting #how-to-run-locally → that link has aria-current 'location'"; "AC-55: hash '#first-tasks' → scrollIntoView called once on #first-tasks; '#evil' → not called"; "No IntersectionObserver → no throw"; "EC-25: nav carries `hidden md:block`".
- **Verify:** `scripts/gate.sh l05b-onboarding-plan-2 S9 -- "cd client && pnpm exec vitest run onboarding/_components/FirstTasksSection onboarding/_components/TourToc && pnpm typecheck"`
- **Depends on:** S4, S5
- **Done when:** AC-55, AC-63; UI parts of AC-39, AC-40.

### S10 — `TourHeader`  [package: client · layer: component] (red phase)
- **Skills:** frontend-architecture, react-best-practices, react-testing-library, test-strategy
- **Files:** `R/_components/TourHeader/{TourHeader.tsx,index.ts,styles.ts,helpers.ts,TourHeader.test.tsx}`.
- **API:** `TourHeader({ repoName, state, actions })` — `<h1>` title; with a tour: subtitle (AC-49, `useFormatter().relativeTime` + `useNow`), footnote (AC-66, `formatUsd`), failed banner (AC-58, `role="alert"`); renders the `actions` slot. Tests use `NextIntlClientProvider now={fixed} timeZone="UTC"`.
- **Test first:** "AC-48: h1 'Onboarding for payments-api'"; "AC-49: 'Generated from index of 5 files · generated 2 hours ago · index 1 hour ago'"; "AC-49: partial → '… 120 of 5400 files (partial) …'; total null → '120 files (partial)'; index_updated_at null → no 'index' part"; "AC-66: 'openai/gpt-4.1-mini · 1 call · $0.0007'; cost null → 'cost unknown'; llm_calls 0 → '0 calls'"; "AC-58: failed + last_error {llm_timeout, 5 min ago} + tour from 2 h ago → 'Regeneration failed 5 minutes ago: Model timed out — showing the tour from 2 hours ago'".
- **Verify:** `scripts/gate.sh l05b-onboarding-plan-2 S10 -- "cd client && pnpm exec vitest run onboarding/_components/TourHeader && pnpm typecheck"`
- **Depends on:** S2
- **Done when:** AC-48 (title), AC-49, AC-58, AC-66.

### S11 — `TourActions` and the clipboard hook  [package: client · layer: component / hook] (red phase)
- **Skills:** frontend-architecture, react-best-practices, react-testing-library, test-strategy
- **Files:** `R/_components/TourActions/*`, `R/use-copy-to-clipboard.ts`, `R/use-copy-to-clipboard.test.tsx`.
- **API:** `TourActions({ mode, state, pending, rateLimited, onGenerate, onShare, onCopyMarkdown })` — mode `empty`: Generate + `generateNote`; mode `tour`: Stale badge + reason, Regenerate (disabled when `!cloned`, with `cloneToRegenerate`), Share link, Copy as Markdown; mode `generating`: Regenerate/Generate disabled + "Generating…"; `rateLimited`: `role="alert"` with the message. `useCopyToClipboard()` → `copy(text, successMsg)`: `navigator.clipboard.writeText`, then `useToast().success`; on rejection or missing clipboard `.error(t("copy.failed"))`.
- **Test first:** "AC-52: Generate + 'Makes one model call'; click → onGenerate"; "AC-53: generating → 'Generating…' and every generate/regenerate button disabled"; "AC-51: cloned false → Regenerate disabled + 'Clone the repository to regenerate'"; "AC-54: rateLimited → alert 'Too many generations — try again in a minute'"; "AC-57: stale index_moved → 'Stale' + 'Index moved since this tour' inside the actions group; prompt_changed → 'Tour format changed'; not stale → no badge"; "AC-64 / AC-65: Share link → onShare; Copy as Markdown → onCopyMarkdown; both absent in mode empty"; "NFR-7: every button has a non-empty accessible name". Clipboard: "AC-64: resolves → toast 'Link copied'"; "EC-27: rejects → 'Couldn't copy to the clipboard'"; "EC-27: no navigator.clipboard → same".
- **Verify:** `scripts/gate.sh l05b-onboarding-plan-2 S11 -- "cd client && pnpm exec vitest run onboarding/_components/TourActions onboarding/use-copy-to-clipboard && pnpm typecheck"`
- **Depends on:** S2
- **Done when:** AC-51, AC-52, AC-57; UI parts of AC-53, AC-54; EC-27.

### S12 — `NotClonedState`  [package: client · layer: component] (red phase)
- **Skills:** frontend-architecture, react-testing-library, test-strategy
- **Files:** `R/_components/NotClonedState/{NotClonedState.tsx,index.ts,helpers.ts,NotClonedState.test.tsx}`.
- **API:** `NotClonedState({ indexState, onClone, pending, cloneState })`.
  - `indexState` is `{ data?: RepoIntelState; isLoading: boolean; isError: boolean }`, passed straight from `useRepoIntelStatus` (`client/src/lib/hooks/repo-intel.ts:31`).
  - `cloneState` is `"idle" | "requested" | "timed_out" | "failed"`.
  - `helpers.ts` exports `indexStatusKey(indexState)`: loading → `loading`; error → `unknown`; `degraded` with `degradedReason` or `reason === "no_data"` → `notIndexed`; any other status → its own key. Status values are the API's `full | partial | degraded | failed` (`server/src/modules/repo-intel/types.ts:25`; a missing row is `degraded/no_data`, `server/src/modules/repo-intel/service.ts:189-204`).
  - The button is disabled while `pending` or `cloneState === "requested"`.
  - Notes: `requested` → `notCloned.requested`; `timed_out` → `notCloned.stillCloning`; `failed` → `notCloned.failed` (`role="alert"`).
- **Test first:**
  - "AC-50: shows 'Clone and index this repository to generate a tour'".
  - "AC-50: full → 'Index status: indexed'"; "partial → 'Index status: partially indexed'"; "degraded with reason no_data → 'Index status: not indexed'"; "degraded with another reason → 'Index status: degraded'"; "failed → 'Index status: index failed'"; "loading → 'Index status: checking…'"; "error → 'Index status: unavailable'".
  - "AC-50: 'Clone and index' → onClone; no 'Generate onboarding tour' button".
  - "R6: requested → 'Clone requested — this page updates when it finishes' and the button is disabled".
  - "R6: timed_out → 'Still cloning — refresh the page to check' and the button is enabled".
  - "R6: failed → alert 'Couldn't start the clone — try again' and the button is enabled".
- **Verify:** `scripts/gate.sh l05b-onboarding-plan-2 S12 -- "cd client && pnpm exec vitest run onboarding/_components/NotClonedState && pnpm typecheck"`
- **Depends on:** S2
- **Done when:** the AC-50 UI with the real index status, and the R6 notes.

### S13 — `OnboardingTourView` + route page  [package: client · layer: page] (red phase)
- **Skills:** frontend-architecture, react-best-practices, next-best-practices, react-testing-library, e2e-flows, test-strategy
- **Files:** `R/page.tsx` (`"use client"`; `useParams` → `<OnboardingTourView repoId />`), `R/_components/OnboardingTourView/{OnboardingTourView.tsx,index.ts,styles.ts,OnboardingTourView.test.tsx}`.
- **Imports (pinned so `vi.mock` works):** `useOnboardingTour`, `useGenerateOnboarding` from `@/lib/hooks/onboarding`; `useRepoIntelStatus` from `@/lib/hooks/repo-intel` (the view never imports `useResyncRepoIntel`); `useRefreshRepo` from `@/lib/hooks/core`; `useActiveRepo`, `useRepoNotFound` from `@/lib/repo-context`; `AppShell` from `@/components/app-shell` with `crumb=[{label: full_name, mono:true}, {label: t("breadcrumb")}]`.
- **Implement:**
  - Branch on `tourViewMode`. Generating → 5 `Skeleton` cards (`data-testid="tour-placeholder"`). Tour → `TourToc` + five `SectionCard`s in `TOUR_SECTIONS` order.
  - Share copies `${window.location.origin}/repos/${repoId}/onboarding`; Copy as Markdown copies `tourToMarkdown`; command copy toasts `commandCopied`. Q1 shows `lastFailed`.
  - Clone flow (R6): local `cloneState` starts `"idle"` and resets to `"idle"` when `repoId` changes; "Clone and index" → `refreshRepo.mutate(repoId, { onSuccess: () => set("requested"), onError: () => set("failed") })`; `useOnboardingTour(repoId, { pollUntilCloned: cloneState === "requested" })`; `clonePollTimedOut` → `"timed_out"`. The global mutation toast for a refresh error stays (`client/src/lib/providers.tsx:42`); the inline note is the lasting state.
- **Test first** (mock the modules above; `useResyncRepoIntel` is a spy in the `@/lib/hooks/repo-intel` mock; the AppShell mock renders the crumb labels joined with " › "):
  - "AC-48: breadcrumb 'acme/payments-api › Onboarding Tour'".
  - "AC-68: GET error → 'Couldn't load the onboarding tour'; Retry → refetch".
  - "EC-1: unknown repo → 'Add a repository to see its onboarding tour' with a control to /onboarding".
  - "AC-50: not cloned, no tour → NotClonedState gets the useRepoIntelStatus result (shows 'Index status: not indexed' for degraded/no_data); no Generate".
  - "AC-50: 'Clone and index' calls useRefreshRepo().mutate with 'r1' (POST /repos/:id/refresh); the useResyncRepoIntel spy is never called".
  - "R6: after the refresh succeeds, useOnboardingTour is called with pollUntilCloned true and 'Clone requested …' shows".
  - "R6: refresh mutation errors → pollUntilCloned false, alert 'Couldn't start the clone — try again', button enabled".
  - "R6: clonePollTimedOut true → 'Still cloning — refresh the page to check' and pollUntilCloned false".
  - "R6: a repoId change (rerender r2) resets to idle with pollUntilCloned false".
  - "AC-52: none → Generate → generate.mutate()".
  - "AC-53: generating → 5 placeholders + 'Generating…'".
  - "AC-54: mutate resolves 'rate_limited' → the alert is shown".
  - "AC-55 / AC-41: ready → five cards in spec order with the five anchors".
  - "AC-64: Share link → writeText(`${location.origin}/repos/r1/onboarding`) + 'Link copied'".
  - "AC-65: Copy as Markdown → text starts '# Onboarding for payments-api' + 'Markdown copied'".
  - "AC-61: Copy pnpm run dev → writeText('pnpm run dev')".
  - "Q1: failed + tour null → Generate + 'Last generation failed: Interrupted'".
  - "NFR-2: no state calls generate.mutate without a click".
- **Verify:** `scripts/gate.sh l05b-onboarding-plan-2 S13 -- "cd client && pnpm exec vitest run onboarding/_components/OnboardingTourView && pnpm typecheck"`
- **Depends on:** S1, S3–S12
- **Done when:** AC-48, AC-50, AC-52–AC-54, AC-64, AC-65 and AC-68 wired end to end, and R6 bounded.

### S14 — e2e flow over the seeded tour  [package: e2e · layer: e2e]
- **Skills:** e2e-flows, test-strategy
- **Files:** create `e2e/specs/11-onboarding-tour.flow.json`.
- **Test first:** the flow is the test:
  1. open `{BASE}/`, wait for the url `/pulls`;
  2. `find text "Onboarding Tour" click`, wait for the url `/onboarding`, `wait --load networkidle`;
  3. wait for "Onboarding for payments-api" and the five section titles;
  4. wait for card content: "Guards every public route", "pnpm run dev", "Where settings and limits are defined", "Document the rate limit headers";
  5. wait for "Clone the repository to regenerate" (AC-51);
  6. **no Generate control (AC-70 "no model call", NFR-2).** The runner fails only on a non-zero exit plus an optional `assert.stdoutIncludes` (`e2e/lib/assert.ts:15`, `e2e/run.ts:73`), so this step runs `eval` and checks a count:
     ```json
     { "cmd": ["eval", "'generate_controls=' + [...document.querySelectorAll('button,[role=button]')].filter(b => /Generate onboarding tour/.test((b.textContent || '') + ' ' + (b.getAttribute('aria-label') || ''))).length"],
       "assert": { "stdoutIncludes": "generate_controls=0" },
       "label": "no Generate onboarding tour control is shown (no model call possible)" }
     ```
     The expression's own text never contains `generate_controls=0`, so an echoed command cannot pass the check;
  7. wait for "openai/gpt-4.1-mini" (the footnote; seeded data).

  The `description` names the seed data and states that no model is called. Flow 06 stays unchanged and proves AC-47.
- **Fallback:** the implementer checks `agent-browser --help` first. If `eval` is missing: add `stdoutExcludes?: string` next to `stdoutIncludes` in `e2e/lib/assert.ts:15`, checked in `e2e/run.ts:73` the same way; make step 6 `["snapshot"]` with `"assert": { "stdoutExcludes": "Generate onboarding tour" }`; report which form was used in the deviations.
- **Verify:** `scripts/gate.sh l05b-onboarding-plan-2 S14 -- "cd e2e && npm run typecheck && npm run e2e:hermetic"`; without Docker or agent-browser record "not run: <reason>".
- **Depends on:** S13
- **Done when:** AC-70 (e2e part), including the no-Generate-control check.

### S15 — Insights  [package: client, e2e · layer: docs]
- **Skills:** engineering-insights
- **Files:** `client/INSIGHTS.md`: 409/429 resolved inside `mutationFn` to avoid the global toast (`providers.tsx:42` + the hook line); jsdom lacks IntersectionObserver and scrollIntoView (`src/test/setup.ts:3`); the substring bug in `activeKeyFor` (`helpers.ts:29`). `e2e/INSIGHTS.md` if the TOC duplicating section titles surprises a `wait --text`.
- **Test first:** none (docs only).
- **Verify:** every cited `file:line` exists (`rg -n`).
- **Depends on:** S14
- **Done when:** insights recorded, or "insights: none".

### S16 — AC-72 demonstration (after the fix loop)  [layer: manual]
- **Checklist:**
  1. OpenRouter key in `~/.devdigest/secrets.json`; Settings → Feature Models → onboarding is `openrouter / openai/gpt-4.1-mini`.
  2. `./scripts/dev.sh 2>&1 | tee .claude/handoff/l05b-onboarding-plan-2/logs/ac72-api.log` in tmux.
  3. Add an unfamiliar JS/TS repository (for example `https://github.com/sindresorhus/ky`) and wait for index status `full` or `partial`.
  4. Open the sidebar Onboarding Tour, click Generate once, watch "Generating…" until the five sections render.
  5. Read the tour: the reading path matches the index order; the commands exist in its `package.json`; Open links resolve on GitHub; the footnote shows `1 call · $…`.
  6. Log gate: `scripts/gate.sh l05b-onboarding-plan-2 AC-72 -- "rg -c 'onboarding: done .*llm_calls=1 .*cost_usd=[0-9.]+' .claude/handoff/l05b-onboarding-plan-2/logs/ac72-api.log"` prints 1.
- **Done when:** AC-72; the confirmation goes to plan-verifier as evidence.

## Execution
Run with `/implement specs/plans/2026-10-19-l05b-onboarding-plan-2.md`.
- **Red phase first:** test-writer writes the S1–S13 tests and `R/test-fixtures.ts` from the Test-first lists and pinned APIs. One red run per step (`S#-red`); a missing module counts as a correct red. The implementer must not edit those test files; disagreements are reported as deviations.
- **Implementer ranges (multi):** S1–S5 · S6–S10 · S11–S15. Each range ends with `cd client && pnpm typecheck` green. S16 runs before plan-verifier.
- Then architecture-reviewer → fix loop (≤ 3 rounds) → plan-verifier. Every gate through `scripts/gate.sh l05b-onboarding-plan-2 …`. One commit per stage.

## Verification matrix (run after the last step)
| Package | Commands |
|---|---|
| client | `cd client && pnpm typecheck && pnpm test`; `pnpm build` with `next dev` stopped (new route; type-only shared imports) |
| client checks | `rg -n 'import \{[^}]*\} from "@devdigest/shared"' client/src/app/repos client/src/lib/hooks/onboarding.ts` prints nothing (NFR-9 / build); `rg -n '>[A-Z][a-z]+[ .]' 'client/src/app/repos/[repoId]/onboarding' --glob '*.tsx' --glob '!*.test.tsx'` prints nothing (NFR-8) |
| e2e | `cd e2e && npm run typecheck && npm run e2e:hermetic` (flows 06 and 11 pass) |
| contracts / scope | `diff server/src/vendor/shared/contracts/onboarding.ts client/src/vendor/shared/contracts/onboarding.ts` empty; `git diff --stat ebdcbd8 -- server reviewer-core mcp` empty |
| manual | S16 (AC-72); narrow-window check of EC-25 (TOC hidden, commands scroll) |

## Risks
| Risk | Likelihood | Mitigation in plan |
|---|---|---|
| Tailwind does not emit `md:block` for the new class | L | S9 pins the class; manual EC-25 check; fallback: a media query in `TourToc/styles.ts` |
| `wait --text` matches a TOC title instead of a card | M | Flow 11 also waits on card-only seed content |
| Mermaid in jsdom | M | Mocked in S7 and S13; real render seen in e2e and the demo |
| Polling never stops | L | S1 tests the stop on `ready` and on `cloned` |
| Seeded tour shows "Index moved" after that repo is indexed (null `index_sha`; Plan 1 verification, item 3) | L | Expected per AC-12; the e2e stack never indexes it |
| `pnpm build` skipped while dev runs | M | The matrix requires it with dev stopped; otherwise "not run" |

## Out of scope
- Server, contracts, reviewer-core, MCP (Plan 1, done). R5 goes back for the record.
- Translating the vendor/ui sidebar and shortcut-help labels (R4).
- The client `README.md` route map: doc-writer, on request.
- For the reviewers: `TourMarkdown` sanitising (S5), Mermaid label sanitising (S4), `rel`/`target` on every GitHub link (S7, S9), the `mutationFn` error mapping (S1).
