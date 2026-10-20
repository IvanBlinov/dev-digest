# Plan verification — Onboarding Generator Plan 2 (client + e2e + demo)

**Plan:** [2026-10-19-l05b-onboarding-plan-2.md](2026-10-19-l05b-onboarding-plan-2.md) · **Spec:** [L05b-onboarding-generator.md](../L05b-onboarding-generator.md) (SPEC-02) ·
**Base → HEAD:** ebdcbd8 → 459b143 · **Verifier:** plan-verifier (read-only) · **Date:** 2026-10-20

**Verdict:** gaps. No failures. The gaps are only the checks the user waived (they stay "not run", never passed) and the manual AC-72 checklist, which has no recorded artifact. The user accepted the feature as done with these gaps.

Commits:
- b83f663: plan
- 407fa95: cross-model review
- e351ef9: red tests S1–S13
- 8918db0: implementation S1–S15
- 459b143: architecture review (clean)

## Traceability matrix (AC → step → test → commit)

All tests are from e351ef9 and all implementation is from 8918db0. Each test title starts with its `AC-N`.

| AC | Steps | Tests | Status |
|----|-------|-------|--------|
| AC-46 nav item, `g o` | S3 | `vendor/ui/nav.test.ts`, `useGlobalShortcuts.test.tsx` | met |
| AC-47 `/onboarding` stays Add-repo | S3, S14 | `app-shell/helpers.test.ts` | met (unit); flow 06 not run |
| AC-48 breadcrumb, title | S10, S13 | `TourHeader.test.tsx`, `OnboardingTourView.test.tsx` | met |
| AC-49 subtitle | S10 | `TourHeader.test.tsx` | met |
| AC-50 not cloned, no tour | S1, S4, S12, S13 | hook test, `helpers.test.ts`, `NotClonedState.test.tsx`, view test | met |
| AC-51 not cloned with tour | S4, S11, S14 | `helpers.test.ts`, `TourActions.test.tsx`, flow 11 | met (unit); flow not run |
| AC-52, AC-53 none / generating, 2 s poll | S1, S11, S13 | hook test, `TourActions.test.tsx`, view test | met |
| AC-54 POST, 409 / 429 | S1, S11, S13 | hook test, `TourActions.test.tsx`, view test | met |
| AC-55 TOC, anchors | S4, S9 | `helpers.test.ts`, `TourToc.test.tsx`, `SectionCard.test.tsx`, view test | met |
| AC-56, AC-59 card, chip, unavailable | S6 | `SectionCard.test.tsx` | met |
| AC-57 stale badge | S11 | `TourActions.test.tsx` | met |
| AC-58 failed banner | S10 | `TourHeader.test.tsx` | met |
| AC-60 Open on GitHub | S4, S7 | `helpers.test.ts`, `CriticalPathsSection.test.tsx` | met |
| AC-61 commands, copy, tooltip | S8, S13 | `RunCommandsSection.test.tsx`, view test | met |
| AC-62 reading path | S8 | `ReadingPathSection.test.tsx` | met |
| AC-63 first tasks | S9 | `FirstTasksSection.test.tsx` | met |
| AC-64, AC-65 share link, Markdown | S4, S11, S13 | `helpers.test.ts`, `use-copy-to-clipboard.test.tsx`, view test | met |
| AC-66 footnote | S10 | `TourHeader.test.tsx` | met |
| AC-67 safe Markdown | S5, S7, S8 | `TourMarkdown.test.tsx`, `TruncatedText.test.tsx`, section tests | met |
| AC-68 load error, Retry | S1, S13 | hook test, view test | met |
| UI parts of AC-27, 28, 29, 31, 34, 36, 37, 39, 40 | S7–S9 | section tests | met |
| AC-70 e2e part | S14 | `e2e/specs/11-onboarding-tour.flow.json` | partial: flow written, e2e typecheck clean, flow not run (waived) |
| AC-72 demo | S16 | gate `AC-72` | met for the log gate; manual checklist waived |
| EC-1, 14, 19, 21, 25, 27; Q1; R6 | S1–S13 | tagged tests | met; EC-25 visual check not run (waived) |
| NFR-2, NFR-7, NFR-8, NFR-9 | S2, S11, S13, matrix | tagged tests plus grep checks | met |
| S15 insights | S15 | `client/INSIGHTS.md` (3 entries), `e2e/INSIGHTS.md` (1 entry) | met (inspection) |

AC-72 demo details:
- Repo `sindresorhus/ky`, model `openrouter/openai/gpt-4.1-mini`.
- Result: 1 LLM call, 5 313 tokens in and 586 out, $0.0030628, 6 602 ms.
- Log line: `onboarding: done … status=ready llm_calls=1 … cost_usd=0.0030628 … reasons=-`. The gate counted 1 matching line.

## Commands run by the verifier

| Command | Result |
|---|---|
| `cd client && pnpm typecheck && pnpm test` | exit 0, 476 passed |
| `cd e2e && npm run typecheck` | exit 0 |
| `diff` of the two `contracts/onboarding.ts` copies | identical |
| `git diff --stat ebdcbd8 -- server reviewer-core mcp` | empty: Plan 2 touches the client and e2e only |
| `cd client && pnpm build` | not run: waived by user (dev server on :3000) |
| `cd e2e && npm run e2e:hermetic` | not run: waived by user (agent-browser not installed) |
| Visual review of the tour, EC-25 narrow window | not run: waived by user |

## Residual risks (for the PR description)

- **Flows 06 and 11 have never run.** This includes the `snapshot` + `stdoutExcludes` absence check, which is the plan's S14 fallback.
- **The production build is unverified.** The grep check that `@devdigest/shared` is used by type-only imports passes, which lowers the risk.
- **The `md:block` narrow-window behaviour is only unit-tested** as a class name.
- **Out of scope, not violated:** server, contracts, reviewer-core and mcp are unchanged, and the vendor/ui labels stay English (R4).
