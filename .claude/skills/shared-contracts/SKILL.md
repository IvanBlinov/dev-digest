---
name: shared-contracts
description: "Use when adding or changing a Zod schema or adapter interface in DevDigest's @devdigest/shared (server/src/vendor/shared or client/src/vendor/shared) — a new request/response contract, a new field on Review/Finding/RunTrace/Skill/Agent, or a new port in adapters.ts."
---

# Shared contracts (`@devdigest/shared`)

`server/src/vendor/shared/` is the **canonical** copy; `client/src/vendor/shared/` is a mirror
(no workspace, aliases only — `client/INSIGHTS.md` "vendor/shared is a mirror"). Generic Zod
rules live in the `zod` skill; this skill is the DevDigest procedure.

## Procedure (in this order, same commit)

1. Edit the server copy: `server/src/vendor/shared/contracts/<domain>.ts` (or `adapters.ts` for a port).
   New domain → new file + one `export *` line in `index.ts`; do not reshuffle existing files.
2. Mirror byte-for-byte: `cp server/src/vendor/shared/<f> client/src/vendor/shared/<f>`.
3. Prove the mirror: `diff server/src/vendor/shared/<f> client/src/vendor/shared/<f>` prints nothing.
4. Update consumers: server route `schema` (params/body/response), service/repository types,
   client hooks in `client/src/lib/hooks/`, and `reviewer-core` if it imports the type.
5. Tests: a contract test in `server/test/contracts.test.ts` (parse a valid + an invalid sample)
   when the schema has non-trivial refinements.
6. Gates: `cd server && pnpm typecheck`, `cd client && pnpm typecheck`
   (+ `cd reviewer-core && npm run typecheck` if it uses the type) and `cd client && pnpm build`
   when the client imports a **value** (see rule 3).

## Rules

1. **Backward-compatible data.** New keys on documents stored as jsonb (`RunStats`, `RunTrace`)
   are `.nullish()` — old rows lack them. New keys on DB-row DTOs may be `.nullable()` once the
   column exists after a migration (`server/INSIGHTS.md` "RunStats.cost_usd must stay optional").
2. **Wire format is snake_case** (`run_id`, `agent_name`), matching existing contracts.
3. **Client imports types only** from `@devdigest/shared` (`import type`). A value import
   (schema, constant) passes vitest/tsc but breaks `next build`; mirror constants locally with a
   test asserting equality (`client/INSIGHTS.md` 2026-09-29, `client/src/lib/skill-helpers.ts`).
4. **Never rename or remove** an exported schema without updating every consumer in the same step;
   the server type-checks against `reviewer-core` source and vice versa.
5. **Pre-existing drift** (files that already differ on `main`, e.g. `adapters.ts`, `eval-ci.ts`,
   `productionize.ts` as of 2026-10-07) is not yours to fix in passing — mention it, don't touch it.

## Checklist for a plan step

- [ ] server copy changed first, client mirrored, `diff` empty for every touched file
- [ ] optional vs nullable chosen per rule 1
- [ ] all consumers listed (routes, services, hooks, reviewer-core)
- [ ] typecheck in every consumer package; `pnpm build` if a client value import was added
