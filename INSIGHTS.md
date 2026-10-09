# Insights — project-wide

Dated entries, newest first. Format and rubrics: [.claude/skills/engineering-insights/SKILL.md](.claude/skills/engineering-insights/SKILL.md).
Module-specific lessons go into the module's own `INSIGHTS.md` (`server/`, `client/`, `reviewer-core/`, `e2e/`).

## 2026-10-08 — [Security] A path allowlist hook must check every path component for symlinks
Symptom: `guard-allowed-paths.sh` checked only `[ -L "$root/$rel" ]`, so a write through a symlinked parent directory (e.g. the documented `.cursor/skills -> ../.claude/skills`) or into `client/node_modules/**/README.md` passed the doc-writer allowlist.
Cause: string matching on the requested path says nothing about where the bytes land; only the final component was tested for a link, and `*/README.md` / `*/docs/*` also match inside `node_modules`.
Rule: walk every existing component of the path and block on any symlink; deny `node_modules` before the allow patterns; cover both with harness cases that create a real link.
Proof: `.claude/hooks/guard-allowed-paths.sh:50`, `.claude/hooks/tests/hooks.test.sh` (cases "symlinked parent", "node_modules")

## 2026-10-08 — [Architectural decision] Writer subagents are path-limited by one profile-based allowlist hook
Context: two new subagents (`test-writer`, `doc-writer`) each need write access, but only to a
narrow, different set of paths — a tool denylist cannot express "Edit/Write, but only here".
Decision: one script, `guard-allowed-paths.sh <profile>`, does root/`..`/symlink normalisation
once and keeps per-agent policy as a single `case "$profile"` block, instead of one hook script
per writer agent.
Consequence: adding a third path-limited writer costs one profile plus a few rows in
`.claude/hooks/tests/hooks.test.sh`, not a new script; `guard-protected-paths.sh` stays the
separate denylist for Bash-capable agents (implementer, test-writer, plan-verifier,
architecture-reviewer) and is unaffected.
Proof: `.claude/hooks/guard-allowed-paths.sh:43`, `.claude/agents/doc-writer.md:15`

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

## 2026-10-07 — [Architectural decision] One skill-routing table for planner, implementer and pr-self-review
Context: three agents/skills must agree on which project skills apply to which paths; three copies would drift.
Decision: the path → skill table lives only in `pr-self-review` Step 2; `planner` and `implementer` read it instead of keeping their own copy. "Do not touch" for the implementer is enforced by a PreToolUse hook, not only by prompt text.
Consequence: adding a skill = one row in that table; a new protected path = one case in `.claude/hooks/guard-protected-paths.sh`.
Proof: `.claude/skills/pr-self-review/SKILL.md:31`, `.claude/agents/implementer.md:12`
