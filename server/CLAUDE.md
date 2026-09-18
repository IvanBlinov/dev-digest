# @devdigest/api (server/)

Fastify 5 API: imports repos and PRs, indexes repos with `repo-intel`, stores agents, runs
reviews through `@devdigest/reviewer-core`, persists grounded findings in Postgres (pgvector).
Details, request/DI diagram, API map, env table: [README.md](README.md).

## Read first

- [README.md](README.md) — stack, API map, environment, review-context notes
- [docs/](docs/README.md) — internals and design decisions for this package
- [specs/](specs/README.md) — feature specs with acceptance criteria
- [INSIGHTS.md](INSIGHTS.md) — pitfalls; read before touching migrations, adapters, or the run executor
- [src/modules/repo-intel/README.md](src/modules/repo-intel/README.md) — the indexer
- [../docs/agent-prompts/README.md](../docs/agent-prompts/README.md) — how prompts are assembled
- **Insights (always on):** record findings per [../.claude/skills/engineering-insights/SKILL.md](../.claude/skills/engineering-insights/SKILL.md) into [INSIGHTS.md](INSIGHTS.md) as you go, with date + `file:line` proof.
- Parent: [../CLAUDE.md](../CLAUDE.md)

## Layout

- `src/modules/<name>/` — one Fastify plugin per feature: `routes.ts`, `service.ts`, `repository.ts`, `constants.ts`. Registered statically in `src/modules/index.ts`.
- `src/adapters/` — ports to the outside world (`llm`, `github`, `git`, `astgrep`, `tokenizer`, `embedder`, `secrets`, `codeindex`, `depgraph`). Test doubles in `src/adapters/mocks.ts`.
- `src/platform/` — `config.ts` (env → `AppConfig`), `container.ts` (DI), `errors.ts` (`AppError` + error envelope), `jobs.ts`, `model-router.ts`, `price-book.ts`, `resilience.ts`, `run-logger.ts`.
- `src/db/schema/` — Drizzle schema, one file per domain; `src/db/migrations/` — generated SQL. The schema already holds **every** lesson's tables; unused ones stay empty.
- `src/vendor/shared/` — `@devdigest/shared` Zod contracts (canonical copy; client mirrors it).
- `src/modules/reviews/run-executor.ts` — gathers diff + repo map and calls the engine.

## Commands

```sh
pnpm install
pnpm db:migrate        # apply migrations — NOT run on boot
pnpm db:seed           # idempotent demo data (acme/payments-api, PR #482, two agents)
pnpm db:generate       # drizzle-kit generate after editing src/db/schema
pnpm test              # all vitest
pnpm exec vitest run --exclude '**/*.it.test.ts'   # hermetic unit only
pnpm exec vitest run .it.test                      # DB-backed integration (needs Docker)
pnpm typecheck
```

Dev server: `tsx watch src/server.ts` on `:3001` (run inside tmux).

## Conventions

- **Schema-first validation.** Every route declares Zod `params`/`body`/`response` from `@devdigest/shared` via `fastify-type-provider-zod`. Never hand-parse `req.body` in a handler. Invalid input → 422 before the handler runs.
- **Plugins before modules.** helmet, cors, rate-limit, SSE and the error handler are registered first so encapsulated module plugins inherit them.
- **Services depend on ports, not adapters.** Resolve everything through the DI container so tests can swap `MockLLMProvider`, `MockGitClient`, etc.
- **Tests split by filename.** `*.it.test.ts` = real Postgres via testcontainers (self-skips without Docker). Everything else must be hermetic and key-free.
- **Rate limits.** Global 120/min (off under `NODE_ENV=test`); tighter per-route caps on expensive endpoints like `POST /pulls/:id/review`. SSE and `/health*` are exempt.
- **New module checklist:** `modules/<name>/` → register in `modules/index.ts` → contracts in `vendor/shared` → an `*.it.test.ts` for any DB-backed route → spec in `specs/`.

## Boundaries

- Secrets are read only through `SecretsProvider` (`src/adapters/secrets/local.ts`). No `process.env.OPENAI_API_KEY` reads elsewhere.
- Prompt assembly and grounding live in `reviewer-core`. This package supplies inputs and stores outputs; it does not build prompts.
- Consumes `reviewer-core` **TypeScript source** via tsconfig alias — do not add a build step or `dist/` import.
- `REPO_INTEL_ENABLED` defaults to true; an unindexed repo must degrade silently to diff-only, never fail the review.

## Workflow

Spec in `specs/` → failing test (unit or `.it.test.ts`) → implementation → `pnpm typecheck` →
if a migration was added, `pnpm db:migrate` locally and note it in `INSIGHTS.md` if anything was surprising.
