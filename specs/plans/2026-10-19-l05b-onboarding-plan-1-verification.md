# Plan verification: Onboarding Generator, Plan 1

**Plan:** [2026-10-19-l05b-onboarding-plan-1.md](2026-10-19-l05b-onboarding-plan-1.md) (+ [review delta](2026-10-19-l05b-onboarding-plan-1-review.md)) · **Spec:** [../L05b-onboarding-generator.md](../L05b-onboarding-generator.md) (SPEC-02)
**Date:** 2026-10-19 · **Agent:** `plan-verifier` · **Verified HEAD:** `d943f13` · **Verdict:** all met. Every AC and NFR that Plan 1 owns has a passing test tagged with its AC; the open items are listed first.

## Commits
| Stage | Commit |
|---|---|
| Spec, revision | `7fda3d5`, `2e39975` |
| Plan | `54b723e` |
| Cross-model plan review + delta | `2121bc8` |
| Red-phase tests (S7–S13) | `df5808f` |
| Implementation S1–S15 | `152fc81` |
| Architecture review (clean) | `4b061c8` |
| Fix round 1: F-1 symlink containment, F-2 1 MiB bound | `d943f13` |
| Fix round 2: F-3 `.git` paths, F-4 TOCTOU | `0cca138` |

## Not closed or notable
1. **Tree fingerprint mismatch.** The stray, uncommitted `mcp/package.json` `packageManager` line changed the fingerprint. It is not part of any commit. The verifier therefore re-ran every gate itself.
2. **Seed idempotence (`db:migrate && db:seed` ×2).**
   - The verifier did not run it, because it needs the dev DB.
   - The S12–S15 implementer reports running it twice on a throwaway `it-db.sh` DB (row ended `ready` / `onboarding-v1`), but it was not logged as its own gate step.
   - `seed-onboarding.test.ts` (AC-70, data part) passes.
3. **`deriveStale` when the tour's `index_sha` is null and an index exists** returns `index_moved` (`server/src/modules/onboarding/helpers.ts:162-172`). This matches the AC-12 wording "differs", but no test covers it, and the spec does not define the case. It affects the seeded tour once its repo is first indexed.

## Traceability matrix (AC → step → test → commit)
Tests live in `server/test/` unless a path is given. `df5808f` is a red-phase test the implementer did not edit; `152fc81` is a test written alongside the implementation (S1–S6, S14).

| AC | Step | Test (file: title prefix) | Commit | Status |
|---|---|---|---|---|
| AC-1 | S13 | onboarding.it: "AC-1: POST → 202 …" | df5808f | met |
| AC-2 | S1, S13 | contracts: "AC-2: OnboardingTourState accepts …"; onboarding.it: "AC-2: … parses as OnboardingTourState" | 152fc81 / df5808f | met |
| AC-3 | S13 | onboarding.it: "AC-3: no tour → status none …" | df5808f | met |
| AC-4 | S11, S13 | onboarding-repository.it: "AC-4: two concurrent startIfIdle …"; onboarding.it: "AC-4: POST while running → 409 …" | df5808f | met |
| AC-5 | S13 | onboarding.it: "AC-5: clonePath null → 409 repo_not_cloned …" | df5808f | met |
| AC-6 | S13 | onboarding.it: "AC-6: … 7th POST within a minute gets 429" | df5808f | met |
| AC-7 | S11, S13 | repository.it: "AC-7: failStale(600000) …"; onboarding.it: "AC-7: a generating row started 11 min ago …" | df5808f | met |
| AC-8 | S3, S11, S13 | onboarding-schema.it: "AC-8: …"; repository.it: "AC-8: finishSuccess …"; onboarding.it: "AC-8: tour readable from a fresh buildApp" | 152fc81 / df5808f | met |
| AC-9 | S11, S13 | repository.it + onboarding.it: "AC-9: … previous tour kept …" | df5808f | met |
| AC-10 | S11, S13 | repository.it + onboarding.it: "AC-10: … skeleton" | df5808f | met |
| AC-11 | S1, S12 | contracts: "AC-11: requires index_sha …"; onboarding-generator: "AC-11: tour metadata …" | 152fc81 / df5808f | met |
| AC-12 | S10, S13 | onboarding-helpers: "AC-12: index sha differs → index_moved …"; onboarding.it: "AC-12: …" | df5808f | met (null-sha case untested, item 3) |
| AC-13 | S3, S13 | onboarding-schema.it + onboarding.it: "AC-13: … row is gone" | 152fc81 / df5808f | met |
| AC-14 | S5, S12 | llm-no-retry: "AC-14: … sends one request" (×3); generator: "AC-14 / AC-18: maxRetries 0 …" | 152fc81 / df5808f | met |
| AC-15 | S12 | generator: "AC-71 / AC-15: … exactly 1 completeStructured call" | df5808f | met |
| AC-16 | S12 | generator: "AC-16: llm() throws ConfigError → 0 calls …" | df5808f | met |
| AC-17 | S2, S12 | feature-models (server + `client/src/lib/feature-models.test.ts`): "AC-17: onboarding default …"; generator: "AC-17: … resolveModel('onboarding')" | 152fc81 / df5808f | met |
| AC-18 | S12 | generator: "AC-14 / AC-18: … timeoutMs 60000, maxTokens 3000, temperature 0.2" | df5808f | met |
| AC-19 | S12 | generator: "AC-19: failure reasons …" | df5808f | met |
| AC-20 | S10, S12 | onboarding-helpers: "AC-20: formatDoneLine …"; generator: "AC-20 / AC-21 / NFR-4: the sink holds exactly 2 records …" | df5808f | met |
| AC-21 | S9, S12 | prompt-log-helpers: "AC-21: …" (×2); `reviewer-core/test/onboarding-prompt.test.ts`: "AC-21: sections carry … no text field" | df5808f | met |
| AC-22 | S1, S12 | generator: "AC-22: generation = {provider, model, llm_calls 1, …}" | df5808f | met |
| AC-23 | S4, S7, S12 | git-list-dir: "AC-23: …" (×3); onboarding-facts: "AC-23: every readFile path is on the allowlist", "… nested docs/README.md or an arbitrary src/index.ts", "a readFile that throws …"; generator: "AC-23: `.env` is never read" | 152fc81 / df5808f | met |
| AC-24 | S7 | onboarding-facts: "AC-24: … 20 names; secret appears nowhere" | df5808f | met |
| AC-25 | S9 | onboarding-prompt: "AC-25: every repo-derived fact is inside an `<untrusted` block", "AC-25: README containing `<untrusted>` variants …" | df5808f | met |
| AC-26 | S9, S12 | onboarding-prompt: "AC-26: oversize facts drop readme, then repo_map, then symbols, then endpoints …"; generator: "AC-26: … budget_trimmed … dropped=readme" | df5808f | met |
| AC-27 | S8 | onboarding-sections: "AC-27: …" | df5808f | met |
| AC-28 | S8 | sections: "AC-28: module and edge rules", "… exactly 8 module nodes", "… exactly 4 service nodes" | df5808f | met |
| AC-29 | S8 | sections: "AC-29: empty graph → diagram null …" | df5808f | met |
| AC-30 | S8 | sections: "AC-30: …", "a file with crons and no endpoints …", "9 candidate files → exactly 5" | df5808f | met |
| AC-31 | S8, S10 | sections: "AC-31: fact = …"; helpers: "AC-31: … truncated" | df5808f | met |
| AC-32 | S7 | facts: "AC-32: …" (×4) | df5808f | met |
| AC-33 | S10 | helpers: "AC-33: unknown command ids dropped …" | df5808f | met |
| AC-34 | S7 | facts: "AC-34: … empty command list" | df5808f | met |
| AC-35 | S6, S8 | repo-intel-onboarding-reads.it: "AC-35: …" (×2); sections: "AC-35: …", "12 eligible ranked files → exactly 8" | 152fc81 / df5808f | met |
| AC-36 | S8, S10 | sections + helpers: "AC-36: …" | df5808f | met |
| AC-37 | S8 | sections: "AC-37: no edges → reading path unavailable …" | df5808f | met |
| AC-38 | S10 | helpers: "AC-38: ≤ 3 tasks …" | df5808f | met |
| AC-39 | S10 | helpers: "AC-39: … first_tasks deterministic …" | df5808f | met |
| AC-40 | S8 | sections: "AC-40: known_paths …" | df5808f | met |
| AC-41 | S10 | helpers: "AC-41: …" | df5808f | met |
| AC-42 | S10 | helpers: "AC-42: … ready / partial / skeleton" | df5808f | met |
| AC-43 | S10 | helpers: "AC-43: …" (×2) | df5808f | met |
| AC-44 | S6, S8, S12 | repo-intel-onboarding-reads.it, sections, generator: "AC-44: …" | df5808f | met |
| AC-45 | S6, S8, S12 | repo-intel-onboarding-reads.it, sections, generator: "AC-45: …" | df5808f | met |
| AC-69 | S1, S4 | contracts: "AC-69: …" (×3); mirrored `vendor/shared` files | 152fc81 | met |
| AC-70 (data) | S14 | seed-onboarding: "AC-70: the seed tour parses OnboardingTour …" | 152fc81 | met (seed ×2 not re-verified, item 2) |
| AC-71 | S12 | generator: "AC-71 / AC-15: …" | df5808f | met |
| AC-46–68, AC-70 (e2e), AC-72 | — | — | — | deferred to Plan 2 |

## NFRs and review-delta items
| Item | Evidence | Status |
|---|---|---|
| NFR-2 / review row 6: GET has no side effects | onboarding.it "NFR-2: GET starts no generation in any stored state" (7 states incl. stale `generating`) | met |
| NFR-3 / row 8: GET p95 ≤ 300 ms | onboarding.it "NFR-3: GET p95 ≤ 300 ms …" | met |
| NFR-3 / row 8: facts ≤ 10 s on 5000 files | generator "NFR-3: fact collection ≤ 10 s with 5000 files" | met |
| NFR-4 / row 5: exactly two sink records, no content | generator "AC-20 / AC-21 / NFR-4 …", "NFR-4: sink records contain no README text …" | met |
| Row 2: S7 allowlist spy | onboarding-facts AC-23 tests | met |
| Row 4: S8 caps | onboarding-sections cap tests | met |
| NFR-1 constants, NFR-5 | constants.ts; AC-25/AC-26 tests | met by tests; the constant table was not checked line by line |
| NFR-9 mirror | `diff` of 4 server vs client `vendor/shared` files is empty | met |
| NFR-6–8 | client / e2e | deferred to Plan 2 |

## Gates re-run by the verifier (on `d943f13`)
| Command | Result |
|---|---|
| `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'` | pass 549/549 |
| `cd reviewer-core && npm run typecheck && npm test` | pass 69/69 |
| `cd client && pnpm typecheck`; `vitest run src/lib/feature-models.test.ts` | pass; 3/3 |
| `cd mcp && npm run typecheck` | pass |
| `scripts/it-db.sh run` onboarding-schema / -repository / onboarding / repo-intel-onboarding-reads | 3/3, 5/5, 14/14, 5/5 |
| `pnpm db:migrate && pnpm db:seed` ×2 | not run (dev DB) |

## Deviations confirmed (all benign)
- **`failStale` keeps `started_at`** (`server/src/modules/onboarding/repository.ts:103-109`). The plan said to clear it, but the red NFR-2 test asserts it stays unchanged. The row stops matching the `generating` filter anyway, and the finish methods null it.
- **`MAX_SYMBOL_CHARS_PER_FILE = 750`** (`reviewer-core/src/onboarding/prompt.ts:38`). This cap is not in the spec; it was added so the AC-26 drop order holds.
- **A whole-reader failure in `readCloneFacts` yields empty clone facts** (`generator.ts:102`). No test covers it and no AC defines it.

## Unplanned changes
- `server/test/git-read-file.test.ts` and the `readFile` hardening (F-1–F-4) come from the security review, not from a plan step.
- `server/test/helpers/onboarding-fixtures.ts` is test support.
- `mcp/package.json` is an uncommitted stray edit and is not in any commit.

## Addendum: fix round 2 (`0cca138`)
Fix round 2 touched only `server/src/adapters/git/simple-git.ts`, `server/test/git-read-file.test.ts` and `server/INSIGHTS.md`. No AC row changes. The gates re-run after the round, logged in `evidence.jsonl`:

| Gate | Result |
|---|---|
| `F-3-red` | failed as expected (the symlink into `.git/config` returned its text) |
| `final-r2`: `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'` | pass 551/551 |
| `final-r2-it`: `scripts/it-db.sh run server/test/onboarding.it.test.ts` | pass 14/14 |

**Follow-up (not in this plan):** the GitHub token is still stored in the clone's `.git/config`, because `withGitHubToken` puts it into the remote URL (`server/src/modules/repos/helpers.ts:29`). It should be passed per command instead (credential helper or `http.extraheader`).
