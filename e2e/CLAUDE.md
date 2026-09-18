# @devdigest/e2e (e2e/)

Deterministic browser flows for the web app, driven by Vercel **agent-browser** (Rust + CDP CLI).
No Playwright, no LLM, no API key. How flows work and how to run: [README.md](README.md).

## Read first

- [README.md](README.md) — flow format, hermetic runner, preconditions
- [docs/](docs/README.md) — suite design notes; **feature specs live in [docs/specs/](docs/specs/README.md)** because `specs/` is taken by flow files
- [INSIGHTS.md](INSIGHTS.md) — pitfalls; read before running against a dev DB
- [../TESTING.md](../TESTING.md) — where this suite sits among the others
- **Insights (always on):** record findings per [../.claude/skills/engineering-insights/SKILL.md](../.claude/skills/engineering-insights/SKILL.md) into [INSIGHTS.md](INSIGHTS.md) as you go, with date + `file:line` proof.
- Parent: [../CLAUDE.md](../CLAUDE.md)

## Layout

- `specs/NN-name.flow.json` — **test flows**, not documentation. Each is an ordered list of agent-browser commands. Current: 01 app boot, 02 repo pulls detail, 03 agents, 04 PR findings, 05 PR diff, 06 onboarding, 07 settings.
- `run.ts` — runs every flow in order against one shared browser session; a non-zero exit fails the step.
- `lib/` — helpers for `run.ts`.
- `agent-browser.json` — CLI config.
- `docs/specs/` — human-written specs for new journeys (what to cover, which seeded data).

## Commands

```sh
npm i -g agent-browser && agent-browser install   # once
npm run e2e:hermetic     # isolated freshly-seeded stack (Postgres :5433, API :3101, web :3100) — RECOMMENDED
npm test                 # runs flows against E2E_BASE_URL (default http://localhost:3000)
npm run typecheck
```

## Conventions

- **Deterministic locators only:** `wait --url`, `wait --text`, `find role|text|label`. Never the AI `chat` command.
- **`wait` is the assertion.** It times out with non-zero exit; add `"assert": { "stdoutIncludes": … }` only when a substring check adds value.
- **Seeded data only:** demo repo `acme/payments-api`, PR #482, the two built-in agents. Nothing may trigger a model call.
- **`{BASE}`** is substituted with `E2E_BASE_URL`.
- One flow per main user journey; keep flows short and label every step.

## Boundaries

- Flows 02/04/05 follow the home redirect to the *first* repo, so they assume a freshly seeded DB. Use the hermetic runner locally.
- **Never `docker compose down -v`** to "reset" — it deletes the dev volume.
- No unit-level assertions here; component behaviour is tested in `../client`.

## Workflow

Spec in `docs/specs/` → new `specs/NN-name.flow.json` → `npm run e2e:hermetic` → record surprises in `INSIGHTS.md`.
