# DevDigest

Local-first AI pull-request reviewer. This is the **course starter**: one flow works end to end
(add repo → import PR → run agent review → grounded findings). Each course lesson adds one feature.

Full description, architecture diagram, quick start: [README.md](README.md).
Test strategy across packages: [TESTING.md](TESTING.md).

## Repository structure

Four standalone packages, **no monorepo workspace** (no `pnpm-workspace.yaml`; each package has
its own lockfile). Each has its own `CLAUDE.md` — read it before working inside that folder.

| Folder | Package | Role | Port | CLAUDE.md |
|--------|---------|------|------|-----------|
| `server/` | `@devdigest/api` | HTTP API, DB, repo cloning + indexing (`repo-intel`), review runs | 3001 | [server/CLAUDE.md](server/CLAUDE.md) |
| `client/` | `@devdigest/web` | The studio UI: repos, PRs, findings, agents, settings | 3000 | [client/CLAUDE.md](client/CLAUDE.md) |
| `reviewer-core/` | `@devdigest/reviewer-core` | Pure review engine: diff → prompt → LLM → grounded findings | — | [reviewer-core/CLAUDE.md](reviewer-core/CLAUDE.md) |
| `e2e/` | `@devdigest/e2e` | Deterministic browser flows over the seeded stack | — | [e2e/CLAUDE.md](e2e/CLAUDE.md) |
| `server/src/vendor/shared/` | `@devdigest/shared` | Zod contracts used by every package (mirrored in `client/src/vendor/shared/`) | — | — |
| `docs/`, `specs/`, `INSIGHTS.md` | — | Cross-module design docs, cross-module feature specs, project-wide lessons | — | — |
| `scripts/` | — | `dev.sh` (full local stack), `e2e.sh` (hermetic e2e stack) | — | — |
| `.claude/skills/` | — | Team skills catalog: [.claude/skills/README.md](.claude/skills/README.md) | — | — |

Cross-package code is shared via **tsconfig path aliases only** (`@devdigest/shared`,
`@devdigest/reviewer-core`, `@devdigest/ui`); nothing is published or built into `dist/`.

## Tech stack

| Package | Language / runtime | Framework | Key libraries | Tests |
|---------|--------------------|-----------|---------------|-------|
| `server/` | TypeScript, Node ≥ 22, `tsx` | Fastify 5 | Drizzle ORM + `postgres` (pgvector), `fastify-type-provider-zod`, `@fastify/helmet` / `cors` / `rate-limit`, `fastify-sse-v2`, `zod`, `openai`, `@anthropic-ai/sdk`, `octokit`, `simple-git`, `@ast-grep/napi`, `@vscode/ripgrep`, `graphology`, `js-tiktoken`, `p-queue` | vitest, testcontainers (Postgres) |
| `client/` | TypeScript, React 19 | Next.js 15 App Router | TanStack Query, `next-intl`, Tailwind CSS 4, `recharts`, `mermaid`, `react-markdown` + `remark-gfm`, `lucide-react`, `zod` | vitest + jsdom, React Testing Library |
| `reviewer-core/` | TypeScript (source-only, never emits JS) | — | `zod`, `openai` (OpenRouter-compatible client) | vitest |
| `e2e/` | TypeScript, `tsx` | Vercel agent-browser CLI (Rust + CDP) | — | `run.ts` flow runner |
| Infra | Docker | — | `pgvector/pgvector:pg16` via `docker-compose.yml` | — |

Package managers: **pnpm** for `server/` and `client/` (`pnpm-lock.yaml`), **npm** for
`reviewer-core/` and `e2e/` (`package-lock.json`).

## Run commands

```sh
./scripts/dev.sh              # Postgres (Docker) + migrations + seed + API :3001 + web :3000
./scripts/dev.sh --db-only    # Postgres only  (also: --no-seed, --no-client, --help)
docker compose up -d          # Postgres only, manual
cd server && pnpm db:migrate && pnpm db:seed     # first run / after schema changes
```

Per-package dev servers are listed in each module's CLAUDE.md. Run long-lived dev servers inside
tmux so logs stay reachable.

## Check commands

```sh
cd server        && pnpm test && pnpm typecheck
cd server        && pnpm exec vitest run --exclude '**/*.it.test.ts'   # hermetic unit only
cd server        && pnpm exec vitest run .it.test                      # DB-backed (needs Docker)
cd client        && pnpm test && pnpm typecheck
cd reviewer-core && npm test  && npm run typecheck
cd e2e           && npm run typecheck && npm run e2e:hermetic
```

There is **no lint script** in any package (no ESLint/Biome/Prettier config). `typecheck` is the
static gate; keep it green before finishing any task.

## Naming conventions

- **Files (TypeScript, non-component):** kebab-case — `run-executor.ts`, `diff-loader.ts`, `repo-intel.ts`.
- **React components:** PascalCase folder + file + `index.ts` barrel — `_components/FindingCard/FindingCard.tsx`. Shared components under `src/components/<kebab-folder>/<PascalName>/`.
- **Hooks:** `use` prefix, camelCase, one domain per file in `client/src/lib/hooks/` — `usePrReviews` in `reviews.ts`.
- **Tests:** colocated `<Name>.test.tsx` for components; server tests live in `server/test/`; DB-backed server tests end with `.it.test.ts`, everything else is hermetic.
- **Server modules:** `src/modules/<kebab-name>/` with fixed file roles `routes.ts`, `service.ts`, `repository.ts`, `helpers.ts`, `constants.ts`.
- **Adapters:** `src/adapters/<port>/<provider>.ts` — `adapters/llm/openai.ts`; test doubles in `adapters/mocks.ts` named `Mock<Port>` (`MockLLMProvider`).
- **Database:** tables and columns snake_case in SQL (`pull_requests`, `head_sha`), camelCase in Drizzle/TS (`pullRequests`, `headSha`). Migrations are `NNNN_<name>.sql`, generated by `drizzle-kit`.
- **Zod contracts:** PascalCase schema names in `@devdigest/shared` (`Review`, `Finding`, `IdParams`); inferred types share the name.
- **Constants:** UPPER_SNAKE for module-level constants (`DEFAULT_MAP_THRESHOLD_LINES`, `INJECTION_GUARD`).
- **Env vars:** UPPER_SNAKE, read only in `server/src/platform/config.ts` (config) or `adapters/secrets/` (secrets).
- **i18n keys:** one JSON per feature in `client/messages/<locale>/<feature>.json`, camelCase keys.
- **e2e flows:** `e2e/specs/NN-kebab-name.flow.json`, numbered in run order.
- **Specs / docs:** `specs/LNN-kebab-name.md` (course-lesson prefix) or `XX-kebab-name.md`; ADRs `adr-NNNN-kebab-title.md`.
- **Git:** conventional commits `<type>: <description>` (`feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`).

## Do not touch

- **Migrations — `server/src/db/migrations/**`.** Never edit or delete an existing `NNNN_*.sql` or the `meta/` journal by hand. Schema changes go through `src/db/schema/*.ts` → `pnpm db:generate` → a **new** migration file → `pnpm db:migrate`. Migrations do **not** run on boot.
- **Lock files — `pnpm-lock.yaml`, `package-lock.json` (all four packages).** Never edit by hand and never regenerate wholesale. They change only as a side effect of an intentional `pnpm add`/`npm install <pkg>` in that package, committed together with the `package.json` change. Do not switch a package between pnpm and npm.
- **`docker compose down -v`** — never. It deletes the `devdigest_pgdata` volume with every imported repo and review.
- **`src/vendor/shared` copies** — never let `server/` and `client/` copies diverge; change the server copy first, mirror in the same commit.
- **`reviewer-core/src/index.ts` exports** — the server type-checks against this source; renaming or removing an export breaks the server.
- **Secrets** — only via `SecretsProvider` (`~/.devdigest/secrets.json`, `process.env` fallback). Never in git, the DB, or docs.

## Engineering insights (mandatory)

Every session, for every task, apply the **engineering-insights** skill
([.claude/skills/engineering-insights/SKILL.md](.claude/skills/engineering-insights/SKILL.md))
without being asked. When you discover something that fits one of the five rubrics —
**Pitfall, Non-obvious behaviour, Architectural decision, Performance, Security** — write it
immediately into the `INSIGHTS.md` of the module you are working in (`server/`, `client/`,
`reviewer-core/`, `e2e/`; root `INSIGHTS.md` for cross-module). Every entry carries a date and a
`file:line` proof. Before finishing a task, state either what you recorded or "insights: none".
A Stop hook (`.claude/hooks/insights-reminder.sh`) enforces this check once per session.

## Documentation map

- [docs/](docs/README.md) — cross-module design; today: [docs/agent-prompts/](docs/agent-prompts/README.md)
- [specs/](specs/README.md) — feature specs spanning more than one package
- [INSIGHTS.md](INSIGHTS.md) — project-wide lessons learned; read before non-trivial changes
- Each module: `README.md` (what/how to run) · `docs/` (why) · `specs/` (what to build) · `INSIGHTS.md` (lessons)

## Workflow

1. Write or update a spec in the relevant `specs/` folder (module-level, or root for cross-module).
2. Tests first, then implementation (see [TESTING.md](TESTING.md) for which suite).
3. Record insights as you go (see above), then run the check commands for every package you touched.
4. Update the module `README.md` only when the "what is it / how to run" story changes.
