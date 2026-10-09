---
name: test-strategy
description: "Use when deciding which test to write first for a DevDigest change, where it lives, how to stub the outside world, and which command proves it — server unit vs *.it.test.ts, client component tests, reviewer-core engine tests, or an e2e flow."
---

# Test strategy (DevDigest)

Source of truth: `TESTING.md`. Tests are **typological, not exhaustive**: one happy path plus the
edge that actually matters, at the seam (route, adapter, contract, pipeline, rendered component).

## Pick the suite

| Change | Test first in | Stub with | Command |
|--------|---------------|-----------|---------|
| server helper / pure logic | `server/test/<feature>-helpers.test.ts` | nothing | `cd server && pnpm exec vitest run test/<file>.test.ts` |
| server route / service without DB | `server/test/<feature>.test.ts` via `buildApp({ config, overrides })` | `src/adapters/mocks.ts` (`MockLLMProvider`, `MockGitHubClient`, `MockGitClient`, `MockUrlFetcher`, …) | same |
| DB-backed route / repository | `server/test/<feature>.it.test.ts` + `test/helpers/pg.ts` | real Postgres; mocks for LLM/GitHub | see `db-schema-change` (TEST_DATABASE_URL) |
| reviewer-core | `reviewer-core/test/…` | a fake `LLMProvider`; assert on assembled prompt + grounded output | `cd reviewer-core && npm test` |
| client component | colocated `<Name>.test.tsx` | `vi.mock` the hook module (`@/lib/hooks/<domain>`), `vi.mock` heavy children; wrap in `NextIntlClientProvider` with the real `messages/en/<ns>.json` | `cd client && pnpm exec vitest run <path>` |
| client pure helper | colocated `helpers.test.ts` | nothing | same |
| main user journey (new screen/route) | `e2e/specs/NN-name.flow.json` | seeded data only | see `e2e-flows` |

## Rules

1. **Red first.** Run the new test and see it fail for the right reason before implementing.
2. **Hermetic by default.** No network, no keys, no real LLM in unit tests. A DB test must be
   named `*.it.test.ts` — the unit lane excludes that glob.
3. **Assert behaviour, not internals:** HTTP status + body, rendered text/roles, prompt sections,
   emitted events. Query by role/label/text (`react-testing-library`).
4. **Never weaken a test to make it pass.** If an existing test breaks, either the change is wrong
   or the test encoded old behaviour on purpose — report it in deviations.
5. **A gate that did not run is "not run: <reason>"**, never "passed".

## Gates per package (run at the end)

| Package | Command |
|---------|---------|
| server | `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'` (+ touched `.it.test.ts`) |
| client | `cd client && pnpm typecheck && pnpm test` (+ `pnpm build` after a new `@devdigest/shared` value import or route) |
| reviewer-core | `cd reviewer-core && npm run typecheck && npm test` then `cd server && pnpm typecheck` |
| e2e | `cd e2e && npm run typecheck` (+ `npm run e2e:hermetic` when flows changed) |

`next build` while `next dev` runs on :3000 corrupts the dev server's `.next` — stop dev first,
or skip `build` and report it as not run (`client/INSIGHTS.md`).
