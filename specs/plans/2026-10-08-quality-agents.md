# Development Plan: Four quality subagents (test-writer, architecture-reviewer, plan-verifier, doc-writer)

**Spec:** [`specs/XX-quality-agents.md`](../XX-quality-agents.md) · **Base commit:** `4a5da4f`
**Packages:** none of the four app packages. Touches `.claude/agents/`, `.claude/hooks/`,
`.claude/skills/pr-self-review/`, root `AGENTS.md`, `INSIGHTS.md`, `specs/plans/README.md`.
**Size:** M (9 steps)

Produced by the `planner` agent on 2026-10-08 and approved by the user on the same day. User
decisions on the open questions are in the spec's "Decisions" table. Lines marked **(decision N)**
below were changed from the planner's draft to apply them.

## Goal

Add four project subagents. Each has a fixed output template and least-privilege tooling:

- **test-writer**: tests only, confined to test paths by a hook.
- **architecture-reviewer**: boundaries only, read-only, every finding backed by evidence.
- **plan-verifier**: an evidence-based traceability check of the working tree against a plan file.
- **doc-writer**: Markdown docs only, behind a hook-enforced allowlist, with a deterministic
  placement table and Mermaid diagrams.

Update the catalog, pipeline and Documentation map so the main session knows when to delegate to
each agent.

## Acceptance criteria

The spec lists AC1–AC12. Each one maps to a proof here:

- AC1 (frontmatter) → `FRONTMATTER`
- AC2 (test-writer allowlist) → `hooks.test.sh` test-writer cases
- AC3 (doc-writer allowlist) → `hooks.test.sh` doc-writer cases
- AC4 (reviewers read-only, generic guard message) → `FRONTMATTER` + protected-paths cases
- AC5 (Step 0 / Output / Before returning) → `SHAPE`
- AC6 (sources) → `SOURCES`
- AC7 (README) → `FACTCHECK` + `grep -c '^| \[' .claude/agents/README.md` = 7
- AC8 (AGENTS.md) → `test -L CLAUDE.md && grep -n 'plan-verifier' AGENTS.md`
- AC9 (implementer hand-off) → `grep -n 'test-writer' .claude/agents/implementer.md`
- AC10 (citations exist) → `FACTCHECK`
- AC11 (guard regression) → `hooks.test.sh` regression cases
- AC12 (routing) → `grep -n '.claude/hooks' .claude/skills/pr-self-review/SKILL.md`

## Context applied

| Source (file:line) | Rule or insight | Effect on this plan |
|--------------------|-----------------|---------------------|
| `.claude/agents/README.md` "Adding or changing an agent" | One file per agent, `name` = file stem, smallest tool set, deny Agent/Workflow, hook over prompt, Step 0 + fixed template, update the catalog and I/O tables | S3, S5–S7 frontmatter. S8 updates the tables in the same change |
| `.claude/agents/README.md` "Guardrails" | Config-enforced and prompt-only rules are listed separately | S8 adds rows and states what stays prompt-only |
| `.claude/agents/implementer.md:10-15` | Frontmatter `hooks: PreToolUse` wiring with `$CLAUDE_PROJECT_DIR` | S3/S5/S6/S7 copy this shape |
| `.claude/agents/implementer.md:45-47` | The implementer writes the red test itself | S4 adds the hand-off rule for tests written by test-writer |
| `.claude/hooks/guard-protected-paths.sh:9-25` | Path matching inside the script with `jq`. Exit 2 + stderr blocks the call | S2 copies the pattern. Paths are matched in the script, not in the hook `if` field (support unverified, [S5]) |
| `.claude/hooks/guard-protected-paths.sh:2,31` | Header and commit message say "implementer" | S1 makes them generic |
| `.claude/skills/pr-self-review/SKILL.md` Step 2 | The single routing table. `.claude/skills/**`, `docs/**`, `specs/**` map to "fact check" | Agents read the table and do not copy it. S9 adds `.claude/agents/**` and `.claude/hooks/**` |
| `.claude/skills/pr-self-review/SKILL.md` Step 1 | Scope commands (merge-base, tracked + untracked) | architecture-reviewer and plan-verifier reuse them by reference |
| `INSIGHTS.md` 2026-10-07 | One routing table. Do-not-touch is enforced by a hook | Path limits come from a hook (S2) |
| `INSIGHTS.md` "CLAUDE.md is a symlink" | Edit `AGENTS.md` only | S9 edits `AGENTS.md`. The doc-writer hook blocks symlinks |
| `AGENTS.md` naming | `specs/LNN-*.md` / `XX-*`, ADRs `adr-NNNN-kebab-title.md` | doc-writer placement and ADR numbering |
| `AGENTS.md` Documentation map + Workflow | The map lists agents. "Update README only when what/how-to-run changes" | S9 edits both. The doc-writer placement table encodes the README rule |
| `docs/README.md`, `<pkg>/docs/README.md`, `specs/README.md`, `specs/plans/README.md` | What belongs where. Suggested file names. Plans are immutable once implementation starts | Source rows of the doc-writer placement table. Dated plans are blocked **(decision 4)** |
| `.claude/skills/test-strategy/SKILL.md` | Suite per change, red first, hermetic, never weaken a test, "not run ≠ passed", gates | test-writer rules. plan-verifier gate commands |
| `.claude/skills/react-testing-library/SKILL.md` "Query Priority" | Query priority | test-writer cites it together with [T2] |
| `.claude/skills/onion-architecture/SKILL.md` legacy + red flags | Layering rules, legacy modules not to copy | architecture-reviewer rules B1–B6. Pre-existing legacy hits are not flagged |
| `.claude/skills/frontend-architecture/SKILL.md` | Placement-by-reuse, `api.ts`, no `../server` imports | rules B9, B12, B13 |
| `.claude/skills/shared-contracts/SKILL.md` | Client imports from `@devdigest/shared` are type-only. Server copy first, then mirror | rules B10, B11 |
| `client/AGENTS.md`, `reviewer-core/AGENTS.md`, `server/AGENTS.md`, `e2e/AGENTS.md` | Package boundaries | rules B7, B8, B14–B16 |
| `.claude/skills/mermaid-diagram/SKILL.md` | Diagram type guide | doc-writer preloads it |
| `server/test/routes-smoke.test.ts` | `buildApp` + `app.inject` | test-writer pattern, with [T3] |
| `server/src/adapters/mocks.ts` | `Mock<Port>` test doubles | test-writer may extend it **(decision 2)** |
| [S1] [S2] [S5] [T1–T4] [A1–A5] [V1–V2] [D1–D6] | See the spec "Sources" | Cited in each agent file and the README |

## Constraints hit

- **Tool lists are not path-aware [S1].** Write limits are hook-enforced (S2).
  - test-writer keeps Bash to run tests, so a Bash write into source is blocked only by the
    prompt. The README guardrails table says so.
  - doc-writer has **no Bash**, so the hook covers every write it can make.
- **`CLAUDE.md` symlinks.** S9 edits `AGENTS.md` only. The doc-writer hook blocks symlinks.
- **Do not touch:** no migrations, lock files or package code change. `.claude/settings.json` is
  unchanged, because every hook is per-agent frontmatter.
- **No package `package.json` scripts apply.** The verify commands are the shell commands in the
  Verification matrix.

## Contract & data changes

| Contract / table | Before → after | Optional/nullable choice | Consumers to update |
|------------------|----------------|--------------------------|---------------------|
| none (no Zod, DB or API change) | — | — | — |
| Hook CLI `guard-allowed-paths.sh <profile>` | new. Reads PreToolUse JSON on stdin; profile ∈ {`test-writer`, `doc-writer`}; exit 0 allow / 2 block | Unknown profile, missing `jq`, empty path, outside repo, `..`, or symlink: fail closed | frontmatter of `test-writer.md` and `doc-writer.md` |

## Steps

### S1: Hook test harness + generic guard-protected-paths messages  [package: — (.claude) · layer: docs]

- **Skills:** engineering-insights. Fact check.
- **Files:**
  - create `.claude/hooks/tests/hooks.test.sh`
  - modify `.claude/hooks/guard-protected-paths.sh:2`, the header: "PreToolUse guard for agents
    that can write or run Bash (implementer, test-writer, plan-verifier, architecture-reviewer)".
  - modify `.claude/hooks/guard-protected-paths.sh:31`, the message: "agents do not commit or
    push — a human commits after review".
- **Test first:** `hooks.test.sh` is a table-driven harness.
  - Format: `case <script> <profile|-> <tool> <path-or-command> <expected-exit> [stderr-must-not-contain]`.
  - Each case builds JSON with `jq -n` (`{tool_name, tool_input:{file_path|command}}`). It pipes
    the JSON into `CLAUDE_PROJECT_DIR=$(git rev-parse --show-toplevel) bash <script> [profile]`.
  - The harness prints `PASS/FAIL <name>` per case, then `N passed, M failed`. It exits 1 if any
    case failed.
  - Protected-paths cases:

    | Tool | Input | Expected exit |
    |------|-------|---------------|
    | Edit | `$ROOT/server/src/db/migrations/0001_x.sql` | 2 |
    | Write | `$ROOT/client/pnpm-lock.yaml` | 2 |
    | Write | `$ROOT/server/.env` | 2 |
    | Write | `$ROOT/server/.env.example` | 0 |
    | Bash | `docker compose down -v` | 2 |
    | Bash | `git reset --hard` | 2 |
    | Bash | `pnpm exec vitest run` | 0 |
    | Bash | `git commit -m x` | 2, and stderr must not contain `implementer` |

  - The `git commit -m x` case fails before the change.
- **Implement:** change only the two text lines. Do not change the matching logic.
- **Verify:** `bash .claude/hooks/tests/hooks.test.sh` (all PASS) · `bash -n .claude/hooks/guard-protected-paths.sh`
- **Depends on:** —
- **Done when:** AC11; the message part of AC4.

### S2: Shared allowlist hook `guard-allowed-paths.sh`  [package: — (.claude) · layer: docs]

- **Skills:** engineering-insights. Fact check.
- **Files:** create `.claude/hooks/guard-allowed-paths.sh` · modify `.claude/hooks/tests/hooks.test.sh` (add cases).
- **Test first:** add these cases. They must fail before the change, because the script is
  missing (exit 127).
  - **test-writer, allowed (0):**
    - `server/test/foo.test.ts`
    - `server/test/helpers/pg.ts`
    - `reviewer-core/test/prompt.test.ts`
    - `client/src/app/x/_components/Y/Y.test.tsx`
    - `client/src/lib/format-usd.test.ts`
    - `client/src/app/conventions/_components/ConventionsView/test-fixtures.ts`
    - `server/src/adapters/mocks.ts` **(decision 2)**
    - `e2e/specs/08-new.flow.json` **(decision 1)**
    - `server/INSIGHTS.md` **(decision 3)**
  - **test-writer, blocked (2):**
    - `server/src/modules/agents/service.ts`
    - `server/src/adapters/llm/openai.ts`
    - `client/src/test/setup.ts`
    - `client/src/app/x/page.tsx`
    - `server/package.json`
    - `server/vitest.config.ts`
    - `e2e/specs/README.md`
    - `/tmp/x.test.ts` (outside the repo)
    - `server/test/../src/app.ts` (`..` segment)
    - empty `file_path`
  - **doc-writer, allowed (0):**
    - `docs/adr-0001-x.md`
    - `docs/agent-prompts/new.md`
    - `server/docs/db-schema.md`
    - `e2e/docs/coverage.md`
    - `README.md`
    - `client/README.md`
    - `server/src/modules/repo-intel/README.md`
    - `INSIGHTS.md`
    - `specs/L04-x.md` **(decision 4)**
    - `server/specs/x.md` **(decision 4)**
    - `e2e/docs/specs/x.md` **(decision 4)**
    - `specs/plans/README.md` **(decision 4)**
    - `AGENTS.md` **(decision 4)**
    - `server/AGENTS.md` **(decision 4)**
  - **doc-writer, blocked (2):**
    - `specs/plans/2026-10-08-quality-agents.md` (an approved plan is immutable)
    - `.claude/agents/README.md`
    - `CLAUDE.md` (symlink)
    - `server/CLAUDE.md` (symlink)
    - `docs/diagram.png`
    - `server/src/app.ts`
    - `client/src/app/page.tsx`
  - **Other:**
    - unknown profile `foo` → 2
    - the Bash tool under either profile → 0, because this script only judges writes
    - `MultiEdit` on `server/src/app.ts` under test-writer → 2
- **Implement:** one script, with the profile as `$1`. Copy the structure from
  `guard-protected-paths.sh:7-12`.
  1. If `command -v jq` fails, block.
  2. If the tool is not one of `Edit|Write|MultiEdit|NotebookEdit`, exit 0.
  3. Read the path as `guard-protected-paths.sh:16` does. If it is empty, block.
  4. Set `root=${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}` and strip `"$root/"`.
     If the path is not under the root, or contains a `..` segment, block.
  5. If `[ -L "$root/$rel" ]`, block. This covers every `CLAUDE.md`.
  6. In `case "$1"`, check the per-profile **deny patterns first**, then the allow patterns, then
     block by default.
  7. Every block message names the profile and the allowed set, so the agent can self-correct.
- **Why one script:** normalisation is the risky part. Root stripping, `..`, symlinks and
  fail-closed behaviour must be identical for both writers, and they are tested once. The policy
  for each agent is just one `case` block. A third writer agent costs one profile plus some test
  rows. `guard-protected-paths.sh` stays separate: it is a denylist with Bash rules, and the
  implementer depends on it unchanged.
- **Verify:** `bash .claude/hooks/tests/hooks.test.sh` (all PASS) · `bash -n .claude/hooks/guard-allowed-paths.sh`
- **Depends on:** S1
- **Done when:** AC2, AC3 (script level).

### S3: `test-writer` agent  [package: — · layer: docs]

- **Skills:** engineering-insights. Fact check. Read for content: test-strategy,
  react-testing-library, frontend-architecture, onion-architecture, e2e-flows, db-schema-change.
- **Files:** create `.claude/agents/test-writer.md`
- **Test first:** none, because this is a prompt file. S2 already proves the hook behaviour.
- **Frontmatter:**
  - `name: test-writer`
  - `description`: "Use to write or backfill DevDigest tests (server vitest / `.it.test.ts`,
    reviewer-core, client RTL, e2e flows), either as a red phase from an approved plan before the
    implementer, or for existing untested code. Never writes implementation code; writes are
    hook-limited to test files, `Mock<Port>` doubles and INSIGHTS.md."
  - `model: sonnet`
  - `tools: Read, Edit, Write, Bash, Grep, Glob, Skill`
  - `disallowedTools: NotebookEdit, Agent, Workflow, WebSearch, WebFetch`
  - `skills: [test-strategy, engineering-insights]`
  - `hooks.PreToolUse`:
    - `matcher: "Edit|Write"` → `bash "$CLAUDE_PROJECT_DIR"/.claude/hooks/guard-allowed-paths.sh test-writer`
    - `matcher: "Edit|Write|Bash"` → `guard-protected-paths.sh`
- **Body:**
  - **Intro + hook note:** pattern of `implementer.md:25-27`.
  - **Step 0, mode:**
    - **R (red phase):** the input is a plan path plus step IDs. Run the same base and tree
      checks as `implementer.md:34-36`.
    - **B (backfill):** the input is a target code path plus the behaviours to pin.
    - Anything else, or an unstated behaviour → return "Clarifying questions" in the
      `planner.md` Step 0 format.
  - **Step 1, context:**
    - Read root and package `AGENTS.md` + `INSIGHTS.md`.
    - Load skills per test path from the routing table (`pr-self-review/SKILL.md` Step 2). Add
      `db-schema-change` for `.it.test.ts` / `TEST_DATABASE_URL`, and `e2e-flows` for flows.
    - Copy the nearest existing test: `server/test/routes-smoke.test.ts` for routes, the
      colocated `*.test.tsx` for components.
  - **Step 2, write rules:**
    - Pick the suite from `test-strategy` "Pick the suite". Write one happy path plus the edge
      that matters.
    - Assert behaviour, never internals [T1].
    - Follow the RTL query priority [T2] / `react-testing-library`; `getByTestId` comes last.
    - Server routes: `buildApp` + `app.inject` [T3].
    - Mock only real boundaries: `Mock<Port>` in `adapters/mocks.ts` (it may add methods there,
      **decision 2**), or `vi.mock('@/lib/hooks/<domain>')`.
    - Restore mocks between tests. `vi.mock` is hoisted, and partial mocks do not intercept
      internal calls [T4].
    - Never edit implementation, setup or config files. The hook enforces this; Bash writes are
      forbidden by the prompt.
    - If a test id, export or route is missing, list it under "Needs from implementer".
    - Never loosen or delete an existing assertion.
    - Flows follow `e2e-flows` **(decision 1)**. Seed data is off-limits.
  - **Step 3, run each test alone:**
    - Mode R: the test must fail for the expected reason, an assertion failure or the missing
      export or route the plan names. A syntax, import or fixture error is the test's own bug,
      so fix it.
    - Mode B: the test must pass, with one line saying which regression would turn it red.
    - Quote the command and the key output line for each test [S2].
  - **Step 4, output "Test Report":**
    - header: Mode, Plan/target, Base, Status (done | partial | blocked)
    - Tests table: File | Case | AC/behaviour | Command | Result | Key output line
    - AC coverage table
    - Needs from implementer
    - Not run (with reason)
    - Insights recorded
  - **Before returning:**
    - every AC or behaviour has a test or an explicit gap
    - every test was run and its output quoted
    - `git status --porcelain` shows only allowlisted paths
    - no assertion was weakened
  - **Relationship with implementer:** test-writer is used for backfill and for an optional red
    phase, following the [S2] Writer/Reviewer split. In the red phase the implementer runs these
    tests and does not rewrite them (S4). Otherwise the implementer still writes its own tests.
  - `## Sources`: [S1] [S2] [S5] [T1]–[T4].
- **Verify:** `FRONTMATTER`, `SHAPE`, `SOURCES`, `FACTCHECK` on the file
- **Depends on:** S2
- **Done when:** AC1/AC5/AC6 for test-writer; AC2 at the wiring level.

### S4: Implementer consumes test-writer output  [package: — · layer: docs]

- **Skills:** engineering-insights. Fact check.
- **Files:** modify `.claude/agents/implementer.md:45-47` (the Red bullet).
- **Test first:** none, because this is a one-sentence prompt change.
- **Implement:** append to the Red bullet: "If the step's test already exists (written by the
  `test-writer` agent), run it and confirm it is red; do not rewrite, loosen or delete its
  assertions — a test you believe is wrong goes to Deviations." Change nothing else.
- **Verify:** `grep -n 'test-writer' .claude/agents/implementer.md` · `FRONTMATTER`
- **Depends on:** S3
- **Done when:** AC9.

### S5: `architecture-reviewer` agent  [package: — · layer: docs]

- **Skills:** engineering-insights. Fact check. Read for content: onion-architecture,
  frontend-architecture, shared-contracts.
- **Files:** create `.claude/agents/architecture-reviewer.md`
- **Test first:** none, because this is a prompt file.
- **Frontmatter:**
  - `model: opus` [A2]
  - `tools: Read, Grep, Glob, Bash`
  - `disallowedTools: Write, Edit, NotebookEdit, Agent, Workflow, WebSearch, WebFetch`
  - `skills: [onion-architecture, frontend-architecture, shared-contracts]`
  - `hooks.PreToolUse`: `matcher: "Bash"` → `guard-protected-paths.sh`
  - `description`: "Use after implementation, in a fresh context, to check a DevDigest diff
    against architectural boundaries (onion layering, client/server/reviewer-core isolation,
    vendor/shared mirror, placement-by-reuse). Read-only; returns only evidence-backed findings.
    Does not review security, tests, style or plan compliance."
- **Body:**
  - Bash is read-only by prompt; the allowed commands are listed as in `planner.md`.
  - **Step 0:**
    - The input is a base ref, a branch or a plan path. The default is the merge-base with
      `main` (`pr-self-review` Step 1).
    - An empty diff returns "nothing to review".
  - **Step 1:** scope tracked and untracked changes, grouped by layer.
  - **Step 2, rule table:** only added lines are checked. Columns: ID | rule | grep-able check |
    source.

    | ID | Check | Source |
    |----|-------|--------|
    | B1 | `container\.(db\|github\(\|llm\(\|git\|secrets)` in `server/src/modules/*/routes.ts` | onion-architecture red flags |
    | B2 | `from '\.\./\.\./(adapters\|db/schema)` in routes | |
    | B3 | `new \w+(Client\|Provider\|Fetcher)\(` outside `platform/container.ts` and `adapters/` | |
    | B4 | `fastify` import in `service.ts` | |
    | B5 | `Container`, `db/`, `adapters/` or I/O in `helpers.ts` | |
    | B6 | Prompt building in `server/src` (by inspection) | `server/AGENTS.md` |
    | B7 | `reviewer-core/src` imports `../server`, `../client`, `drizzle`, `fastify`, `octokit` or `postgres` | `reviewer-core/AGENTS.md` |
    | B8 | Removed or renamed export: `git diff $MB -- reviewer-core/src/index.ts \| grep '^-.*export'` | `AGENTS.md` Do not touch |
    | B9 | `client/src` imports `../server`, `../reviewer-core` or `@devdigest/reviewer-core` | `client/AGENTS.md` |
    | B10 | Non-`import type` from `@devdigest/shared` in `client/src` | shared-contracts |
    | B11 | `diff server/src/vendor/shared/<f> client/src/vendor/shared/<f>` for each touched file. Pre-existing drift is not flagged | |
    | B12 | `\bfetch\(` in `client/src` outside `lib/api.ts` and tests | frontend-architecture |
    | B13 | A new `src/components/**` component with fewer than 2 route consumers | |
    | B14 | `process\.env\.` in `server/src` outside `platform/config.ts` and `adapters/secrets/` | `AGENTS.md` |
    | B15 | `reviewer-core/dist` imports or a new build step | `server/AGENTS.md` |
    | B16 | `e2e/` imports app code or makes unit-level assertions | `e2e/AGENTS.md` |

    Each rule is framed by [A3] (dependencies point inward) and [A4] (coupling goes toward the
    center), and written in the from→to style of [A5].
  - **Step 3, validate each candidate [A1]:**
    - Re-read the line and confirm it was *added*. Legacy files are flagged only for new lines.
    - Give each candidate a confidence of 0–100 and keep only ≥80 [A2].
    - Never flag pre-existing issues, nitpicks, general quality, security, tests, style or plan
      compliance.
  - **Step 4, output "Architecture Review":**
    - header: scope and Verdict (`clean` | `findings`)
    - Critical (90–100) and Important (80–89) tables: # | Rule | file:line | Evidence | Why (source) | Fix | Confidence
    - "Rules checked" table: Rule | command | hits | kept
    - discarded candidates (count + reason)
    - "Not checked"
    - if nothing was found, say so plainly [A2]
  - **Before returning:**
    - every finding has file:line, quoted evidence, a rule ID and a fix
    - every rule row shows the command actually run
    - nothing is outside the boundaries scope
  - `## Sources`: [S1] [S2] [S5] [A1]–[A5].
- **Verify:** `FRONTMATTER`, `SHAPE`, `SOURCES`, `FACTCHECK`. Also dry-run the B1/B9/B14 `rg`
  patterns: each must exit 0 or 1, never 2.
- **Depends on:** S1
- **Done when:** AC1/AC4/AC5/AC6 for architecture-reviewer.

### S6: `plan-verifier` agent  [package: — · layer: docs]

- **Skills:** engineering-insights. Fact check. Read for content: test-strategy.
- **Files:** create `.claude/agents/plan-verifier.md`
- **Test first:** none, because this is a prompt file.
- **Frontmatter:**
  - `model: sonnet` **(decision 5)**
  - `tools: Read, Grep, Glob, Bash`
  - `disallowedTools: Write, Edit, NotebookEdit, Agent, Workflow, WebSearch, WebFetch`
  - `skills: [test-strategy]`
  - `hooks.PreToolUse`: `matcher: "Bash"` → `guard-protected-paths.sh`
  - `description`: "Use after the implementer (and before a human commits) to verify a DevDigest
    working tree against every item of an approved plan in specs/plans/ and its spec — re-runs
    the plan's verify commands and returns a traceability matrix with evidence. Read-only; gives
    no style, refactor, architecture or security advice."
- **Body:**
  - **Step 0:**
    - A plan path is required. The agent also reads the spec the plan links.
    - An implementer report is only a list of claims to check, never evidence [S2].
    - No plan, or a base that is not an ancestor of `HEAD` → `blocked`.
  - **Step 1, requirement list.** Each item gets an ID:
    - ACs
    - each step's Files, Test-first cases and Done-when
    - Contract & data rows
    - Constraints
    - Out-of-scope items, which must *not* appear in the diff
  - **Step 2, evidence:**
    - The scope is base..working tree, tracked plus untracked.
    - Run every Verify command and the matrix itself. Quote the command, exit code and key line.
    - Choose a method per item [V2]: Test, Analysis, Inspection or Demonstration.
    - An item with no closure artifact cannot be `met`.
  - **Step 3, status:**
    - Each item gets exactly one of `met` / `partially met` / `not met` / `cannot verify`. This
      vocabulary is a synthesis, not a standard term.
    - Keep coverage (an implementation exists) separate from verification (a test or command
      passed) [V1].
  - **Step 4, bidirectional scope:**
    - plan→diff: items that are missing
    - diff→plan: unplanned changes
  - **Step 5, plan gaps:** ambiguous or untestable ACs are listed as gaps, not as failures.
  - **Bans:** quote [S2] "Report gaps, not style preferences". Flag only gaps that affect
    correctness or the stated requirements.
  - **Output "Plan Verification":**
    - header: Plan, Spec, Base→HEAD, Verdict (`all met` | `gaps` | `blocked`)
    - traceability matrix: ID | Requirement (quoted) | Method | Implementation evidence | Test evidence | Status
    - Commands run
    - Unplanned changes
    - Out-of-scope violations
    - Implementer claims contradicted
    - Plan gaps
  - **Before returning:**
    - every plan item is in the matrix
    - every `met` has an artifact
    - every command was run or is marked `not run: <reason>`, which means `cannot verify`
  - `## Sources`: [S1] [S2] [S5] [V1] (secondary) [V2] (search-summarized).
- **Verify:** `FRONTMATTER`, `SHAPE`, `SOURCES`, `FACTCHECK`
- **Depends on:** S1
- **Done when:** AC1/AC4/AC5/AC6 for plan-verifier.

### S7: `doc-writer` agent  [package: — · layer: docs]

- **Skills:** engineering-insights. Fact check. Read for content: mermaid-diagram.
- **Files:** create `.claude/agents/doc-writer.md`
- **Test first:** none, because this is a prompt file. S2 proves the hook.
- **Frontmatter:**
  - `model: sonnet`
  - `tools: Read, Edit, Write, Grep, Glob, Skill`
  - `disallowedTools: Bash, NotebookEdit, Agent, Workflow, WebSearch, WebFetch`
  - `skills: [mermaid-diagram, engineering-insights]`
  - `hooks.PreToolUse`: `matcher: "Edit|Write"` → `guard-allowed-paths.sh doc-writer`
  - `description`: "Use after a DevDigest feature is implemented to document it from a plan,
    spec, diff or notes — classifies each page (Diátaxis), places it deterministically in docs/,
    <pkg>/docs/, specs/, a README or AGENTS.md, adds Mermaid diagrams, and verifies every claim
    against code. Writes Markdown docs only (hook-enforced); never source code, approved plans
    or agent config."
- **Body:**
  - **Step 0:**
    - The input is the material plus the reader's question.
    - Return clarifying questions when:
      - the feature has no code evidence, because only what exists gets documented
      - the request is a tutorial, which has no home in this repo
- **Step 1:** classify each page as tutorial, how-to, reference or explanation [D1].
  - **Step 2, placement table.** It is deterministic: the first matching row wins.

    | # | Content | Target |
    |---|---------|--------|
    | 1 | Decision that affects 2 or more packages | `docs/adr-NNNN-<kebab>.md` |
    | 2 | Decision inside one package | `<pkg>/docs/adr-NNNN-<kebab>.md` |
    | 3 | Cross-package flow or design (explanation) | `docs/<kebab>.md` |
    | 4 | Reviewer agent prompts or model choice | `docs/agent-prompts/` |
    | 5 | Package-internal "why" | `<pkg>/docs/<name>.md`, using the suggested file name from that `docs/README.md` when one fits |
    | 6 | A module that already has its own README | that README, for example `server/src/modules/repo-intel/README.md` |
    | 7 | What it is, how to run it, route map, commands | package or root `README.md`, and only when that story changes |
    | 8 | Feature spec: what to build, or as-built ACs **(decision 4)** | `specs/LNN-*` / `XX-*` or `<pkg>/specs/`. Approved plans `specs/plans/YYYY-*.md` are never edited |
    | 9 | Repo map, Documentation map or workflow lines **(decision 4)** | root or package `AGENTS.md`. Never `CLAUDE.md` |
    | 10 | Lessons | `INSIGHTS.md`, per engineering-insights |
    | 11 | `.claude/**` | not doc-writer. Returned as a proposed edit |

    - Always add the new page to the index README of its folder.
    - ADR numbering takes the next free `NNNN` in the folder, starting at `0001`.
  - **Step 3, verify claims:**
    - Every behavioural claim links to source `file:line`.
    - Link to code instead of copying it.
    - A claim that cannot be proven is dropped and listed.
  - **Step 4, diagrams:**
    - Use the shallowest C4 level that answers the question [D3].
    - Pick the Mermaid type from `mermaid-diagram` [D4]/[D5]: sequence for runtime flows,
      flowchart for decisions or C4 views as subgraphs, ER for schema, state for lifecycles.
    - Use a ```mermaid fence, with at most one diagram per question.
  - **Step 5, style [D6]:**
    - second person, active voice, sentence-case headings, code font for identifiers,
      descriptive link text
    - ADRs follow [D2]: Title, Status, Context, Decision ("We will…"), and Consequences, all of
      them, not only the positive ones
  - **Output "Documentation Report":**
    - Pages: Path | Diátaxis type | Placement row | Diagrams
    - Claims verified: Claim | file:line
    - Dropped claims
    - Index READMEs updated
    - Proposed edits outside my scope
    - Insights
  - **Before returning:**
    - every page has a type and a placement row
    - every claim links to file:line
    - relative links resolve (checked with Glob)
    - no write outside the allowlist was attempted
  - `## Sources`: [S1] [S5] [D1]–[D6].
- **Verify:** `FRONTMATTER`, `SHAPE`, `SOURCES`, `FACTCHECK`
- **Depends on:** S2
- **Done when:** AC1/AC3/AC5/AC6 for doc-writer.

### S8: Update `.claude/agents/README.md`  [package: — · layer: docs]

- **Skills:** engineering-insights. Fact check.
- **Files:** modify these sections of `.claude/agents/README.md`: Pipeline, Catalog (change
  "all three" to "all"), Inputs and outputs, Guardrails, Sources (append a block), Adding or
  changing an agent.
- **Test first:** none, because this is docs only.
- **Implement:**
  - **Pipeline:** the one from the spec. Note that no security-reviewer exists yet.
  - **Catalog:** four new rows, exactly as in S3/S5/S6/S7.
  - **Inputs and outputs:** four rows, one each for Test Report, Architecture Review, Plan
    Verification and Documentation Report.
  - **Guardrails rows:**
    - test-writer and doc-writer write limits → `guard-allowed-paths.sh <profile>`
    - test-writer Bash writes → prompt only
    - reviewer and verifier Bash read-only → prompt only, plus `guard-protected-paths.sh`
    - doc-writer has no Bash → `disallowedTools`
  - **Paragraph "test-writer vs implementer"**, from S3/S4.
  - **Paragraph "Why one allowlist hook"**, from S2.
  - **Sources block** "fetched 2026-10-08 by the researcher agent":
    - [S5], [T1]–[T4], [A1]–[A5], [V1] (secondary), [V2] (search-summarized), [D1]–[D6], with URLs
    - a rule→source table with columns test-writer | architecture-reviewer | plan-verifier | doc-writer
    - "Not from external sources": model choices, the B-rule table, the placement table, the
      status vocabulary, and the user decisions 1–4 from the spec
  - **New bullet under "Adding or changing an agent":** "A path-limited writer gets a profile in
    `guard-allowed-paths.sh` plus rows in `.claude/hooks/tests/hooks.test.sh`."
- **Verify:** `FACTCHECK` · `grep -c '^| \[' .claude/agents/README.md` = 7 · `SOURCES`
- **Depends on:** S3–S7
- **Done when:** AC6 (README part), AC7.

### S9: Root map, routing table, plans README, insight  [package: — · layer: docs]

- **Skills:** engineering-insights. Fact check.
- **Files:**
  - `AGENTS.md` Documentation map: list all seven agents, each with a one-phrase role.
  - `AGENTS.md` Workflow: the chain from the spec pipeline.
  - `.claude/skills/pr-self-review/SKILL.md` routing table:
    - add `.claude/agents/**` to the fact-check row
    - add a row `.claude/hooks/**` → "none — run `bash .claude/hooks/tests/hooks.test.sh`"
    - the gate row also covers hooks
  - `specs/plans/README.md`: plans are also the input of `test-writer` (red phase) and
    `plan-verifier`.
  - `INSIGHTS.md`: one `[Architectural decision]` entry, "Writer subagents are path-limited by one
    profile-based allowlist hook", with Context, Decision and Consequence. Proof:
    `.claude/hooks/guard-allowed-paths.sh:<line>` and `.claude/agents/doc-writer.md:<hooks line>`.
- **Test first:** none, because this is docs only.
- **Implement:** text edits only. Never touch `CLAUDE.md`.
- **Verify:**
  - `test -L CLAUDE.md && readlink CLAUDE.md`
  - `grep -n 'plan-verifier\|doc-writer\|test-writer\|architecture-reviewer' AGENTS.md specs/plans/README.md`
  - `grep -n '.claude/hooks' .claude/skills/pr-self-review/SKILL.md`
  - `FACTCHECK`
  - `bash .claude/hooks/tests/hooks.test.sh`
- **Depends on:** S8
- **Done when:** AC8, AC10, AC12.

## Skill map

| Step | Paths | Skills |
|------|-------|--------|
| S1 | `.claude/hooks/guard-protected-paths.sh`, `.claude/hooks/tests/hooks.test.sh` | engineering-insights; fact check |
| S2 | `.claude/hooks/guard-allowed-paths.sh`, `hooks.test.sh` | engineering-insights; fact check |
| S3 | `.claude/agents/test-writer.md` | engineering-insights; fact check; read: test-strategy, react-testing-library, frontend-architecture, onion-architecture, e2e-flows, db-schema-change |
| S4 | `.claude/agents/implementer.md` | engineering-insights; fact check |
| S5 | `.claude/agents/architecture-reviewer.md` | engineering-insights; fact check; read: onion-architecture, frontend-architecture, shared-contracts |
| S6 | `.claude/agents/plan-verifier.md` | engineering-insights; fact check; read: test-strategy |
| S7 | `.claude/agents/doc-writer.md` | engineering-insights; fact check; read: mermaid-diagram |
| S8 | `.claude/agents/README.md` | engineering-insights; fact check |
| S9 | `AGENTS.md`, `.claude/skills/pr-self-review/SKILL.md`, `specs/plans/README.md`, `INSIGHTS.md` | engineering-insights; fact check |

## Verification matrix (run after the last step)

| Check | Command |
|-------|---------|
| hooks | `bash -n .claude/hooks/*.sh && bash .claude/hooks/tests/hooks.test.sh` (all PASS, exit 0) |
| **FRONTMATTER** | `python3 -c 'import sys,yaml;[print(f,(lambda m:(m["name"]==f.rsplit("/",1)[-1][:-3],m["model"],m["tools"],m.get("disallowedTools"),m.get("skills"),bool(m.get("hooks"))))(yaml.safe_load(open(f).read().split("---")[1]))) for f in sys.argv[1:] if not f.endswith("README.md")]' .claude/agents/*.md`. Every tuple starts with `True` and the values match the catalog |
| **SHAPE** | `for f in test-writer architecture-reviewer plan-verifier doc-writer; do grep -c -E '^## Step 0\|Output \(exactly this shape\)\|^## Before returning' .claude/agents/$f.md; done` (3 each) |
| **SOURCES** | `grep -oE '\[(S[125]\|T[1-4]\|A[1-5]\|V[12]\|D[1-6])\]' .claude/agents/{test-writer,architecture-reviewer,plan-verifier,doc-writer,README}.md \| sort \| uniq -c` |
| **FACTCHECK** | for each changed `.md`, extract the backticked paths (`.md/.ts/.tsx/.sh/.json`, with an optional `:line`). Each one must exist from the repo root or relative to the file. Spot-check the line numbers with `sed -n` |
| root docs | `test -L CLAUDE.md && test -L server/CLAUDE.md` · `git status --porcelain` lists only S1–S9 files (plus this plan and the spec, which are uncommitted inputs) |
| app packages | not run: no file in `server/`, `client/`, `reviewer-core/` or `e2e/` changed |
| optional live demo (human) | Ask `test-writer` to edit `server/src/app.ts`; expect `BLOCKED by guard-allowed-paths`. Ask `doc-writer` to write `.claude/x.md`; expect the same |

## Risks

| Risk | Likelihood | Mitigation in plan |
|------|------------|--------------------|
| Frontmatter `hooks:` with a script argument do not fire, or are quoted wrongly | Low–Med | Same wiring shape as the implementer. The script is tested standalone. Optional live demo |
| test-writer writes source via Bash (`cat >`, `sed -i`) | Med | Prompt ban, the `git status` check in "Before returning", and a README guardrail row marked prompt-only |
| test-writer turns `mocks.ts` into a place for logic **(decision 2)** | Low–Med | The prompt allows only `Mock<Port>` test doubles that mirror a port. architecture-reviewer B3 still applies |
| doc-writer rewrites a spec's intent or `AGENTS.md` rules **(decision 4)** | Med | Placement rows 8–9 limit it to as-built facts and map lines. Every claim needs file:line. Approved plans are hook-blocked. A human reviews before commit |
| Path normalisation hole | Med | Fail-closed design, with a dedicated S2 case for each hole |
| architecture-reviewer reports pre-existing legacy noise | Med | Only added lines are checked, plus validation pass [A1] and the ≥80 threshold [A2] |
| plan-verifier cannot run DB or e2e gates | Med | `not run` → `cannot verify`, never `met` |
| pr-self-review, architecture-reviewer and plan-verifier produce duplicate findings | Med | Scopes are stated in each description and in the README |
| Agent files grow too long | Med | Rules kept in tables. Target ≤ ~160 lines each |

## Out of scope

- A `security-reviewer` agent.
- A read-only Bash guard for researcher, planner, architecture-reviewer and plan-verifier.
- Making `guard-protected-paths.sh` fail closed when `jq` is missing.
- Moving the misplaced 2026-10-07 root insight to the top of `INSIGHTS.md`.
- Changes to `.claude/settings.json` or `.claude/skills/README.md`.
- Items for the reviewers:
  - architecture reviewer: the hook profile design
  - security reviewer: path normalisation, trust in `CLAUDE_PROJECT_DIR`, and the test-writer
    Bash residual risk

## Open questions

None blocking. All six were resolved by the user on 2026-10-08 (spec "Decisions").
