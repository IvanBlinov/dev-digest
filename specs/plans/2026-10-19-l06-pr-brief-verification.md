# Plan verification — PR Brief (SPEC-03)

**Plan:** [2026-10-19-l06-pr-brief.md](2026-10-19-l06-pr-brief.md) · **Spec:** [L06-pr-brief.md](../L06-pr-brief.md) · **Base → HEAD:** d0849d0 → 8e836b2 · **Verifier:** plan-verifier (read-only, fresh context) · **Date:** 2026-10-20

**Verdict:** gaps. No AC is *not met*. The open items:
- the manual S21 demo, which is the only proof of AC-61's browser Back;
- two gates that were not run: e2e hermetic (agent-browser is not installed) and `pnpm build` (the dev server was on :3000).

Every other AC has an implementation and a passing test, which the verifier re-ran on the current tree.

Commits:
- 8d33dae: plan
- 22f3038: red tests
- ef8bfe9: S1–S11, including the S5 test repair
- 271ac30: S12–S17
- 90b8304: S18–S20
- 8e836b2: architecture review (clean)

## Traceability matrix (AC → step → test → commit)

| AC | Requirement | Step | Tests (re-run) | Commit | Status |
|----|-------------|------|----------------|--------|--------|
| AC-1, 2, 5 | Brief contract shapes | S1 | `server/test/contracts.test.ts` | ef8bfe9 | met |
| AC-4 | Client mirror equal | S1 | `diff` of server and client `brief.ts` and `platform.ts`: empty | ef8bfe9 | met |
| AC-3 | Response contract, both routes | S1, S11 | `contracts.test.ts`, `brief.it.test.ts` | ef8bfe9 | met |
| AC-6–9, 33–36, NFR-1, NFR-3 | Routes, 409/422/429/502, staleness | S8, S9, S11 | `brief.it.test.ts` (12), `brief-repository.it.test.ts` (4), `brief-helpers.test.ts` | ef8bfe9 | met |
| AC-10 | One request, no retry | S2, S10, S11 | `llm-no-retry.test.ts`, `brief-service.it.test.ts`, `brief.it.test.ts` | ef8bfe9 | met |
| AC-11, 14–18, 30–32 | Inputs, provenance, `prompt.assembled` | S6, S7, S8, S10 | `brief-service.it.test.ts` (9), `brief-helpers`, `prompt-log-helpers`, `project-context-prompt`, `prompt-logging.it` (3), `reviews-project-context.it` (3) | ef8bfe9 | met |
| AC-12 | `risk_brief` default model | S1 | `contracts.test.ts`, `settings-models.it.test.ts` (2) | ef8bfe9 | met |
| AC-13, 14, 22 | Prompt contents and untrusted fencing | S3, S4 | `reviewer-core/test/brief-prompt.test.ts`, `prompt.test.ts` | ef8bfe9 | met |
| AC-19–21 | 12k budget, trim order, output cap | S5, S10 | `brief-budget.test.ts`, `brief-service.it.test.ts` | ef8bfe9 | met |
| AC-23–29 | Output post-validation | S8 | `brief-helpers.test.ts` | ef8bfe9 | met |
| AC-37, 39, 47–50, 52–54 | Summary card | S16 | `BriefSummaryCard.test.tsx`, `hooks/brief.test.tsx` | 271ac30 | met |
| AC-41, 42, 45, EC-21, EC-24 | Risk areas | S14 | `RiskAreas.test.tsx`, `OverviewTab/helpers.test.ts` | 271ac30 | met |
| AC-43, 44 | Review focus | S15 | `ReviewFocus.test.tsx` | 271ac30 | met |
| AC-51 | Empty risks / focus | S14, S15 | `RiskAreas.test.tsx`, `ReviewFocus.test.tsx` | 271ac30 | met |
| AC-56 | Cross-component rule | S14–S16 | tests in all three component files | 271ac30 | met |
| AC-55, NFR-7 | Strings only from `brief.json` | S13 | the component tests render with `messages/en/brief.json` | 271ac30 | met (inspection) |
| AC-38, 40 | Overview layout | S17 | `OverviewTab.test.tsx` | 271ac30 | met |
| AC-46 | Generate only on click (one GET, no POST on mount) | S12, S17 | `hooks/brief.test.tsx`, `OverviewTab.test.tsx` | 271ac30 | met |
| AC-57, 58 | Files changed opens the file and highlights the line | S18, S19 | `FileCard.test.tsx`, `DiffTab.test.tsx`, `DiffTab/helpers.test.ts` | 90b8304 | met (e2e flow 12 written, not run) |
| AC-59, 60, EC-20 | File not in diff / line not shown | S19 | `DiffTab.test.tsx`, `DiffTab/helpers.test.ts` | 90b8304 | met |
| AC-61 | Browser Back returns to Overview | S17, S21 | `OverviewTab.test.tsx` (links use `router.push`) | 271ac30 | partially met (pending: manual demo) |
| NFR-6 | Link safety | S14–S16 | `RiskAreas.test.tsx`, `ReviewFocus.test.tsx` | 271ac30 | met |
| NFR-8 | Verification matrix | all | commands below | — | partially met (2 gates not run) |
| NFR-9 | reviewer-core exports additions only | S3–S5 | `index.ts` +21 and `prompt.ts` +16, no removals; typechecks green | ef8bfe9 | met |
| S21 | Manual P1 demonstration and video | S21 | — | — | pending: manual demo |

## Commands run by the verifier

| Command | Result |
|---|---|
| `cd server && pnpm typecheck` | exit 0 |
| `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` | 560 passed |
| `scripts/it-db.sh run` on the brief-repository / brief-service / brief / intent / prompt-logging / reviews-project-context / settings-models DB tests | 4 / 9 / 12 / 8 / 3 / 3 / 2 passed |
| `cd reviewer-core && npm run typecheck && npm test` | 93 passed |
| `cd client && pnpm typecheck` | 0 errors in `src`; the only error is the stale `.next/types` onboarding page from another branch |
| `cd client && pnpm test` | 418 passed |
| `cd e2e && npm run typecheck` | exit 0 |
| `diff` of the two `vendor/shared` copies | identical |
| `cd e2e && npm run e2e:hermetic` | not run: agent-browser not installed |
| `cd client && pnpm build` | not run: dev server on :3000 |

## Notes
- **Unplanned file:** `client/src/vendor/ui/primitives/IconBtn.tsx` gained `disabled` and `busy` props. The plan did not list it, but the red tests pin these props (the Refresh and Generate pending state).
- **Small out-of-scope edit:** `e2e/AGENTS.md` gained one line registering flow 12. The plan assigns that file to doc-writer.
- **No cross-model plan review:** that stage was skipped by the user's choice.
