# Cross-model plan review: Onboarding Generator, Plan 2

**Plan:** [2026-10-19-l05b-onboarding-plan-2.md](2026-10-19-l05b-onboarding-plan-2.md) · **Spec:** [../L05b-onboarding-generator.md](../L05b-onboarding-generator.md) (SPEC-02)
**Date:** 2026-10-20 · **Skill:** `/plan-review` · **Reviewer model:** `openai/gpt-5.6-terra` (reasoning effort `low`) via the OpenRouter connector
**Generation:** `gen-1792521219-FbCnvJknyLiLf1entoS3` · input 3 508 tokens · output 3 180 tokens (1 928 reasoning) · ≈ $0.045 at $2 / $12 per M

The message carried the Plan 2 part of the spec (Goals/Non-goals, AC-46–68, AC-70, AC-72, edge cases, NFR-6–8) and a condensed plan (decisions, constraints, every step with its tests). The reviewer did not see the full pinned APIs or the full S16 checklist.

## Review (verbatim table)
| # | Severity | Step or AC | Problem | Suggested change |
|---|---|---|---|---|
| 1 | high | AC-50; S12–S13 | No retrieval of index status from `GET /repos/:id/index-state`; S12 tests only a fixed "not indexed" string. | Add an index-state hook; `NotClonedState` renders the real status; tests for each status and for `POST /repos/:id/refresh`. |
| 2 | high | AC-60; S4 | `fileHref` not shown to fall back to the default branch when `index_sha` is absent. | Select `indexSha ?? repo.default_branch`; test both, plus encoding, target, rel and accessible name. |
| 3 | high | NFR-8; R4; S2–S3 | R4 keeps the sidebar label and shortcut text as English in `vendor/ui/nav.ts`, conflicting with NFR-8; the `rg` check scans only `.tsx`. | Route nav strings through i18n or get an approved exception; scan `.ts` too. |
| 4 | high | AC-67; S7 | Critical-path `reason` rendered as inline Markdown, but AC-67 allows Markdown only for narrative/LLM text. | Plain text unless the contract marks it as LLM text; test literal Markdown/HTML. |
| 5 | medium | AC-70; S14 | e2e does not prove "no model call"; asserting the model name is brittle. | Assert no generate request; drop the model-name wait unless guaranteed by the seed. |
| 6 | medium | AC-72; S16 | Demo checks the log shape, not the visible five sections. | Make the checklist explicit (add repo, index, generate once, five titles, footnote, one log line). |
| 7 | medium | R6; S1/S12 | Polling after "Clone and index" has no stop condition or failure state. | Bounded window, stop on refresh failure/unmount/repo change; fake-timer tests. |
| 8 | low | S14–S15 | S14 not labelled with AC-70; S15 (insights) maps to no AC. | Label S14; remove S15 or justify it. |
| 9 | low | S14–S16 | No failing-first artifact for the e2e flow and the demo. | Record a failing e2e state first; scripted demo gate. |

**Verdict:** approve with changes

## Decisions (user, 2026-10-20)
| # | Decision | Reason |
|---|---|---|
| 1 | accepted (partly) | The plan already passes `useRepoIntelStatus` into `NotClonedState`, but tests only "not indexed". Add tests for each `RepoIntelState` status and for loading/error, and assert the control calls `POST /repos/:id/refresh`. |
| 2 | rejected | Already in S4: `fileHref` uses `indexSha ?? repo.default_branch`, with the test "AC-60: fileHref uses index_sha, else default_branch, and encodes segments". The reviewer saw a condensed plan. |
| 3 | rejected | R4 stands: the sidebar label and shortcut text follow the `vendor/ui/nav.ts` config pattern used by every sidebar item; recorded as a reading of NFR-8 (onboarding page strings), not an exception to it. |
| 4 | rejected | The critical-path `reason` comes from the LLM narrative (AC-31), so AC-67 allows Markdown with `skipHtml`, no images, no links. Facts and paths stay plain text. |
| 5 | accepted (partly) | Flow 11 also asserts that no "Generate onboarding tour" control is present. The model-name wait stays: it is seeded data. |
| 6 | rejected | The full S16 checklist already covers adding the repo, indexing, one Generate, the five sections, the footnote and the log gate. |
| 7 | accepted | Bound the clone poll: stop on `cloned`, on refresh-mutation error, on unmount or repo change, and after a 10-minute window with a "still cloning — refresh to check" note; fake-timer tests. |
| 8 | rejected | S15 (insights) is a project rule (`CLAUDE.md` "Engineering insights"); S14 already maps to AC-70. |
| 9 | rejected | The e2e flow is the test and needs the UI built in S1–S13 to exist; S16 is a manual demo by design. |

Accepted rows 1, 5, 7 go to `implementation-planner` as a revision delta (test cases and one stop rule; the spec is unchanged).
