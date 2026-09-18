# @devdigest/web (client/)

Next.js 15 (App Router) studio: import repos, browse PRs, run and read reviews, author agents.
Data via TanStack Query hooks over the Fastify API. Route map and stack: [README.md](README.md).

## Read first

- [README.md](README.md) — stack, UI route map, which API each screen calls
- [docs/](docs/README.md) — UI architecture notes and design decisions
- [specs/](specs/README.md) — screen/feature specs with acceptance criteria
- [INSIGHTS.md](INSIGHTS.md) — pitfalls; read before touching data hooks or the app shell
- **Insights (always on):** record findings per [../.claude/skills/engineering-insights/SKILL.md](../.claude/skills/engineering-insights/SKILL.md) into [INSIGHTS.md](INSIGHTS.md) as you go, with date + `file:line` proof.
- Parent: [../CLAUDE.md](../CLAUDE.md)

## Layout

- `src/app/**/page.tsx` — routes: `/`, `/onboarding`, `/repos/[repoId]/pulls`, `/repos/[repoId]/pulls/[number]`, `/agents`, `/agents/[id]`, `/settings/[section]`. Pages are thin.
- `src/app/**/_components/<Name>/` — feature logic, colocated with its `*.test.tsx`.
- `src/lib/api.ts` — the only fetch layer (`NEXT_PUBLIC_API_BASE`, default `http://localhost:3001`).
- `src/lib/hooks/*` — every TanStack Query hook (`agents`, `core`, `repo-intel`, `reviews`, `trace`).
- `src/components/` — cross-cutting: `app-shell` (nav, breadcrumbs, `g`-then-key shortcuts), `diff-viewer`, `page-shell`, `mermaid-diagram`.
- `src/vendor/ui/` — `@devdigest/ui` primitives (kit, shell, charts, command-palette). `src/vendor/shared/` — mirror of `@devdigest/shared`.
- `messages/<locale>/*.json` — next-intl strings (currently `en`).

## Commands

```sh
pnpm install
pnpm test          # vitest + jsdom, fetch mocked — no API needed
pnpm typecheck
pnpm build
```

Dev server: `next dev -p 3000` (run inside tmux). Needs the API on `:3001`.

## Conventions

- **Server vs client components.** Default to server components; add `'use client'` only where hooks or browser APIs are needed.
- **No fetch outside `src/lib/api.ts`.** New endpoints get a function there and a hook in `src/lib/hooks/`.
- **Contracts, not ad-hoc types.** Response types come from `@devdigest/shared` Zod schemas.
- **UI primitives first.** Use `src/vendor/ui` before writing new styled components.
- **Strings through next-intl.** No hard-coded user-facing text in components.
- **Tests colocated.** Every `_components/<Name>/` ships a `*.test.tsx` (React Testing Library); mock `fetch`, never spin up the API.
- Skills: `next-best-practices`, `react-best-practices`, `react-testing-library` in [../.claude/skills/](../.claude/skills/README.md).

## Boundaries

- Never import from `../server/` or `../reviewer-core/`. Only `@devdigest/shared` and `@devdigest/ui` aliases.
- Browser journeys (real API + seeded DB) belong in [../e2e/](../e2e/CLAUDE.md), not here.
- Do not edit `src/vendor/shared` independently — it must stay identical to `server/src/vendor/shared`.

## Workflow

Spec in `specs/` → failing `*.test.tsx` → component → hook/API function if needed →
`pnpm typecheck` → add an e2e flow in `../e2e/specs/` if a main journey changed.
