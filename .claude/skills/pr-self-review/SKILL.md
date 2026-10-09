---
name: pr-self-review
description: "Use when the user asks to self-review, pre-review, or check a DevDigest branch or working tree before opening or updating a pull request, or asks 'is this ready for a PR?'."
---

# PR self-review (workflow)

A dispatcher: it does not hold review rules itself. It scopes the diff, **routes each changed
path to the skills that own the rules**, runs the gates for the touched packages, and returns
one report. Review only — do not edit files unless the user asks for fixes afterwards.

## Step 1 — Scope

```sh
BASE=${BASE:-main}                                   # or the branch the user names
git fetch origin "$BASE" --quiet || echo "WARN: fetch failed — local $BASE may be stale"
MB=$(git merge-base HEAD "$BASE")
git log --oneline "$MB"..HEAD
git diff --name-status "$MB"                         # tracked: committed + uncommitted vs the fork point
git ls-files --others --exclude-standard             # untracked: in scope, NOT shown by git diff
```

Scope = tracked changes + untracked files. Read tracked files as diffs
(`git diff "$MB" -- <path>`) and untracked files in full. `T` in `--name-status` is a type
change (e.g. file → symlink): check the new target. If a fetch warning printed, put it under Notes.

**Spec to check against:** a `specs/**/*.md` file that is *added* (`A`) on this branch, or that a
commit message on this branch names. A spec that is only edited (e.g. a link fix) is not the
acceptance checklist.

## Step 2 — Dispatch table

For every changed path, load (Skill tool, or read `.claude/skills/<name>/SKILL.md`) each
matching skill **before** judging that file. Load each skill once.

| Changed path matches | Load these skills |
|----------------------|-------------------|
| `client/src/**` | `frontend-architecture`, `react-best-practices`, `next-best-practices` |
| `client/**/*.test.tsx`, `client/src/**/*.test.ts` | `react-testing-library` |
| `client/messages/**` | `frontend-architecture` (i18n section) |
| `server/src/modules/**`, `server/src/adapters/**`, `server/src/platform/**` | `onion-architecture`, `fastify-best-practices` |
| `server/src/db/**` | `db-schema-change`, `drizzle-orm-patterns`, `postgresql-table-design` |
| `*/src/vendor/shared/**` | `shared-contracts`, `zod` |
| server routes, auth, secrets, env/config, file or shell input, LLM prompt text (`server/src/prompts/**`, `reviewer-core/src/**`) | `security` |
| `reviewer-core/src/**` | `typescript-expert`; read `reviewer-core/AGENTS.md` Boundaries |
| `e2e/**` | `e2e-flows`; read `e2e/AGENTS.md` |
| any new or changed test file | `test-strategy` |
| `.claude/skills/**`, `.claude/agents/**`, `**/AGENTS.md`, `**/INSIGHTS.md`, `docs/**`, `specs/**` | none — run the **fact check** below |
| `.claude/hooks/**` | none — run `bash .claude/hooks/tests/hooks.test.sh` |
| any change at all | `engineering-insights` |

**Fact check for instruction/docs files:** every path, symbol, command, and `file:line` they cite
must exist in the current tree (`ls`, `git grep`); every relative link must resolve. A wrong
fact is a High finding — agents act on these files.

## Step 3 — Checks that no skill owns

Run each; any hit is a finding.

| Check | How | Severity |
|-------|-----|----------|
| Existing migration edited | `git diff --name-status "$MB" -- server/src/db/migrations` shows `M`/`D` on an old `NNNN_*.sql` or `meta/` | Blocker |
| Schema changed without a new migration | `server/src/db/schema/**` changed, no new `A` migration file | Blocker |
| Lock file changed without matching `package.json` | lock file in diff, its `package.json` not | High |
| `vendor/shared` mirror | for each changed file under either `vendor/shared`, `diff server/src/vendor/shared/<f> client/src/vendor/shared/<f>` must be empty | High |
| Secrets | secrets grep below prints any line (tracked diff **and** untracked files) | Blocker |
| `process.env` outside config/secrets | new `process.env.` in `server/src` outside `platform/config.ts`, `adapters/secrets/` | High |
| Spec acceptance criteria | each criterion in the spec → implemented + tested? | High if missing |
| Tests for new code | new component/service/route without a new or changed test | Medium |

```sh
# secrets grep — added lines of tracked files, then untracked files
PAT='sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|(API_KEY|TOKEN|SECRET)[A-Z_]*\s*[:=]\s*["'\''][^"'\'' ]{8,}'
git diff "$MB" | grep -E '^\+' | grep -nE "$PAT"
git ls-files -z --others --exclude-standard | xargs -0 grep -nE "$PAT" 2>/dev/null
```

Files under `vendor/shared` that already differ on `main` but are not in this diff are
pre-existing drift: list them under Notes, not as findings.

## Step 4 — Gates for touched packages only

A package counts as touched only when a non-`.md` file inside it changed.

| Package touched | Run |
|-----------------|-----|
| `server/` | `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'` (+ `pnpm exec vitest run .it.test` if Docker is up and DB code changed) |
| `client/` | `cd client && pnpm typecheck && pnpm test` |
| `reviewer-core/` | `cd reviewer-core && npm run typecheck && npm test` |
| `e2e/` | `cd e2e && npm run typecheck` |
| only `.md` / skills changed | the fact check from Step 2 (links + cited paths) |
| `.claude/hooks/**` changed | `bash .claude/hooks/tests/hooks.test.sh` (all PASS) |

Record the exact command and pass/fail. A gate you could not run is reported as "not run: <reason>", never as passed.

## Step 5 — Report (exact shape)

```markdown
## Self-review: <branch> vs <base> (<N> commits, <T> tracked + <U> untracked files)

**Verdict:** Ready | Needs changes | Blocked

### Findings
| # | Severity | file:line | Issue | Rule (skill or check) | Suggested fix |
|---|----------|-----------|-------|-----------------------|---------------|

### Gates
- `<command>` — pass | fail (<first failing line>) | not run: <reason>

### Skills applied
<skill> → <paths it covered>

### Notes
Pre-existing issues outside the diff; spec criteria status.

insights: <recorded entries> | none
```

Verdict rule: any Blocker → Blocked; any High or failed gate → Needs changes; otherwise Ready.
Severities: Blocker, High, Medium, Nit. Every finding cites `file:line` and the rule it breaks.
