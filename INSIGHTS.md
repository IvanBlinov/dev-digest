# Insights — project-wide

Dated entries, newest first. Format and rubrics: [.claude/skills/engineering-insights/SKILL.md](.claude/skills/engineering-insights/SKILL.md).
Module-specific lessons go into the module's own `INSIGHTS.md` (`server/`, `client/`, `reviewer-core/`, `e2e/`).

## 2026-09-29 — [Pitfall] `vendor/shared` copies already differ on `main`
Symptom: `diff -rq server/src/vendor/shared client/src/vendor/shared` reports 5 differing files although AGENTS.md says the copies must stay identical.
Cause: server-side contract additions (`sessionId`, `'openrouter'` provider id, `CommitFile`, eval-ci/knowledge fields) were never mirrored to the client.
Rule: a PR must not *add* drift — check only files it touches (as `pr-self-review` does); fixing the existing drift is its own change.
Proof: `server/src/vendor/shared/adapters.ts:83` vs `client/src/vendor/shared/adapters.ts:77`, `server/src/vendor/shared/contracts/knowledge.ts`

## 2026-09-23 — [Pitfall] `CLAUDE.md` must be a symlink to `AGENTS.md`, not an `@AGENTS.md` import
Symptom: a headless `claude -p` session launched in `server/` did not see the root "Do not touch" rules when the root `CLAUDE.md` contained only `@AGENTS.md`.
Cause: Claude Code did not expand an `@` import from a parent-directory `CLAUDE.md` when the session started in a subdirectory, whether written as `@AGENTS.md` or `@./AGENTS.md`. A launch from the repo root expanded it fine.
Rule: keep every `CLAUDE.md` as a symlink to the `AGENTS.md` next to it (`ln -s AGENTS.md CLAUDE.md`), and edit only `AGENTS.md`. Verified from the root, from `server/`, and with the lazy load of nested files. Needs symlink support: on Windows with `core.symlinks=false` each `CLAUDE.md` checks out as a one-line text file.
Proof: `AGENTS.md:9`, `CLAUDE.md` (symlink → `AGENTS.md`), `server/CLAUDE.md` (symlink)

## 2026-09-17 — [Pitfall] `docker compose down -v` wipes the dev database
Symptom: all imported repos and reviews vanished after a "reset".
Cause: `-v` removes the named volume `devdigest_pgdata`, which the dev stack and every imported repo share.
Rule: never pass `-v` against the dev stack; use the hermetic e2e stack (`scripts/e2e.sh`) when you need a clean DB.
Proof: `docker-compose.yml:23`, `docker-compose.yml:15`

## 2026-09-17 — [Architectural decision] Four packages, four lockfiles, no workspace
Context: the course adds features per package; students fork and diverge.
Decision: no pnpm workspace; each package installs alone, and the server consumes `reviewer-core` **TypeScript source** through a tsconfig path alias.
Consequence: `pnpm install` at the root does nothing; two packages use pnpm and two use npm; never add `pnpm-workspace.yaml` or `dist/` imports.
Proof: `README.md:8`, `server/tsconfig.json:24`, `client/tsconfig.json:24`

## 2026-09-17 — [Non-obvious behaviour] `main` is the starter, not the finished product
Symptom: features listed in the README's lesson table are missing on `main`.
Cause: `main` was reverted to the starter state; course work lives in forks.
Rule: do not merge lesson features into `main` of this repo.
Proof: `README.md:3`, commit `c6af1e4`

## 2026-09-17 — [Non-obvious behaviour] No lint script exists in any package
Symptom: looking for `pnpm lint` before finishing a task.
Cause: none of the four `package.json` files define lint, and there is no ESLint/Biome/Prettier config in the repo.
Rule: `typecheck` + tests are the only static gates; do not claim "lint passed".
Proof: `server/package.json:1`, `client/package.json:1`, `reviewer-core/package.json:1`, `e2e/package.json:1`
