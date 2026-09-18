# Insights — e2e

Dated entries, newest first. Format and rubrics: [../.claude/skills/engineering-insights/SKILL.md](../.claude/skills/engineering-insights/SKILL.md).

## 2026-09-17 — [Pitfall] Flows 02/04/05 land on the wrong repo against a dev DB
Symptom: `wait --url /pulls/482` times out when running `npm test` locally.
Cause: the home route redirects to the *first* repo from `GET /repos`; a dev DB usually has other imports ahead of the seeded one.
Rule: use `npm run e2e:hermetic`, which boots an isolated, freshly seeded stack on alternate ports.
Proof: `e2e/specs/02-repo-pulls-detail.flow.json:9`, `client/src/app/page.tsx:17`, `scripts/e2e.sh:27`

## 2026-09-17 — [Non-obvious behaviour] `specs/` here means flow files, not documentation
Symptom: confusion between `e2e/specs/*.flow.json` and the `specs/` folders in other packages.
Cause: `run.ts` reads every `*.flow.json` from `specs/`; the folder predates the docs convention.
Rule: written feature specs for e2e go to `docs/specs/`; never put markdown in `e2e/specs/`.
Proof: `e2e/run.ts:36`, `e2e/run.ts:55`

## 2026-09-17 — [Pitfall] `docker compose down -v` destroys real data
Symptom: all imported repos and reviews gone after a "clean run".
Cause: `-v` deletes the `devdigest_pgdata` volume shared with the dev stack.
Rule: never use `-v`; the hermetic runner has its own throwaway stack on ports 5433/3101/3100.
Proof: `docker-compose.yml:23`, `scripts/e2e.sh:27`, `scripts/e2e.sh:32`

## 2026-09-17 — [Architectural decision] `wait` commands are the assertions
Context: agent-browser is a CLI, not a test framework; there is no assertion API.
Decision: each step's non-zero exit fails the flow, so `wait --url` / `wait --text` double as assertions; the AI `chat` command is never used.
Consequence: flows are deterministic and key-free, but can only assert visibility and URL, not values.
Proof: `e2e/run.ts:5`, `e2e/specs/02-repo-pulls-detail.flow.json:6`
