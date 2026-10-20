# Cross-model plan review: Onboarding Generator, Plan 1

**Plan:** [2026-10-19-l05b-onboarding-plan-1.md](2026-10-19-l05b-onboarding-plan-1.md) · **Spec:** [../L05b-onboarding-generator.md](../L05b-onboarding-generator.md) (SPEC-02)
**Date:** 2026-10-19 · **Skill:** `/plan-review` · **Reviewer model:** `openai/gpt-5.6-terra` (reasoning effort `low`) via the OpenRouter connector
**Generation:** `gen-1792460594-dPuaGALlGENJqqNtz0Wu` · input 2 279 tokens · output 2 827 tokens (1 929 reasoning) · ≈ $0.04 at $2 / $12 per M

## Attempts
| # | Model | Effort | Input | Result |
|---|---|---|---|---|
| 1 | `openai/gpt-5.6-sol` | high | full spec + full plan (~16k tokens) | timed out (connector gateway); possibly billed |
| 2 | `openai/gpt-5.6-sol` | medium | condensed spec + plan | timed out; possibly billed |
| 3 | `openai/gpt-5.6-terra` | low | condensed spec + plan | answered (below) |

The condensed message summarised the plan's steps; the reviewer did not see the full Test-first lists.

## Review (verbatim table)
| # | Severity | Step or AC | Problem | Suggested change |
|---|---|---|---|---|
| 1 | Critical | Plan decision / AC-14, AC-15 | The plan states that generation runs through a `JobRunner` whose handlers retry. Disabling provider/request retries does not prevent a retried handler from issuing another LLM request for the same persisted generation. | Disable `JobRunner` retries for onboarding generation, or make retries resume only non-LLM persistence work. Add an integration test that forces a post-request failure and proves one generation ID produces exactly one outbound request. |
| 2 | High | S7 / AC-23 | The proposed read-scope tests prove several forbidden filenames are not read, but do not prove an allowlist. An implementation could read arbitrary source files, nested READMEs, other manifests, or non-root compose files and still pass. | Instrument filesystem/Git reads and assert every read is one of the explicitly permitted inputs, with README restricted to root `README*`; add negative cases for arbitrary source files and nested README files. |
| 3 | High | S9, S12 / AC-26 | The plan mentions budget/drop order but does not explicitly cover enforcement of the ≤8000-token limit, retention of mandatory stack/commands/reading-path/critical-path content, or recording dropped groups. | Define the tokenizer/counting mechanism and add oversized-fixture tests asserting token count ≤8000, exact drop order, mandatory sections retained, `budget_trimmed` set, and dropped-group names recorded. |
| 4 | High | S8 / AC-28–30, AC-35–37 | "Deterministic sections on a fixture graph" is insufficiently traceable for the selection rules: summed-rank top 8 modules, max 4 compose services, cross-module edges, critical-path endpoint/cron dependency traversal and exclusions, and reading-path ordering/exclusions. | Add focused fixtures/tests for each cap, rank/path tie-break, compose-service selection, cross-module-only edges, endpoint and cron starts, dependency-chain behavior, and exclusion sets; include empty/degraded graph cases. |
| 5 | Medium | S10, S12 / AC-20, AC-21, NFR logging | The plan tests text-free logging and one prompt event, but does not state that the only generation log output is exactly one `onboarding: done` line and one metadata-only `prompt.assembled` event. | Capture the logger/event sink in generator tests and assert the complete emitted set, exact done-line fields/order, one prompt event with no prompt/repo text, and no other log records. |
| 6 | Medium | S13 / NFR "none on GET/page/refresh/e2e" | There is no explicit test that GET is strictly observational and never starts/resumes generation or invokes the LLM. AC-7 stale handling on GET makes accidental generation side effects especially easy. | Add GET tests for every stored state, including stale-running rows, asserting no background generation and zero LLM calls. |
| 7 | Medium | S10 / AC-12 | `deriveStale` is listed without stated test cases for the required index-state matrix. | Add table-driven tests for absent index state, equal SHA/version, moved index, changed prompt, and both changed; specify reason precedence. |
| 8 | Medium | S6, S7, S12 / NFR-3 | The plan has no performance/latency validation for the explicit NFRs. | Add bounded 5,000-file fixture benchmarks for fact collection and repeated GET latency; ensure GET reads only persisted state. |

**Verdict:** approve with changes

## Decisions (user, 2026-10-19)
| # | Decision | Reason |
|---|---|---|
| 1 | rejected | Misread of the condensed summary: the plan explicitly does **not** use JobRunner (Key constraints, `server/src/platform/jobs.ts:42,66`); generation is an in-process background promise. |
| 2 | accepted | S7: spy on every `readFile`/`listDir` call and assert each read path is on the allowlist; negative cases for a nested README and an arbitrary source file. |
| 3 | rejected | Already covered by the full plan: S9 (≤ 8000 tokens with the injected meter, exact drop order, mandatory facts kept, `dropped` list) and S12 (`budget_trimmed`, `dropped=readme` in the log line). |
| 4 | accepted (partly) | S8: explicit cap tests (8 modules, 4 services, 5 critical paths, 8 reading-path files) and a cron-declaring file as a critical-path entry; other cases already in S8. |
| 5 | accepted | S12: assert the complete emitted log set — exactly one `onboarding: done` line and one `prompt.assembled` event, nothing else. |
| 6 | accepted | S13: GET for every stored state (incl. a stale `generating` row) starts no generation and makes zero LLM calls. |
| 7 | rejected | Already covered by S10's AC-12 cases, including precedence (`index_moved` wins over `prompt_changed`). |
| 8 | accepted | Light measured tests: GET ≤ 300 ms on the seeded DB (S13) and fact collection ≤ 10 s on a 5000-file fake index (S12), each measured once like SPEC-01's NFR-2 test. |

Accepted rows go to `implementation-planner` as a revision delta (test cases only; the spec is unchanged).
