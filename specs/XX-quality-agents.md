# Quality agents: test-writer, architecture-reviewer, plan-verifier, doc-writer

## Goal

The project gets four more subagents around the existing `planner` → `implementer` chain:

- **test-writer** writes UI and backend tests with the matching project skills.
- **architecture-reviewer** checks architectural boundaries without write access and returns
  findings with evidence.
- **plan-verifier** checks finished code against every item of the plan and its requirements,
  and gives no generic advice instead of that check.
- **doc-writer** documents implemented features, turns a plan or other material into docs with
  diagrams, and knows which `docs/` section each page belongs in.

Each agent has one job, least-privilege tools, a fixed output template, and rules backed by
cited primary sources. Write limits are enforced by hooks, not only by prompt text.

## Scope

- In:
  - four agent files in `.claude/agents/`
  - one shared path-allowlist hook plus a shell test harness for all hooks
  - a one-sentence hand-off rule in `implementer.md`
  - updates to the agents README, root `AGENTS.md`, the `pr-self-review` routing table,
    `specs/plans/README.md` and root `INSIGHTS.md`
- Out:
  - a `security-reviewer` agent
  - a Bash write-guard for the read-only agents
  - making `guard-protected-paths.sh` fail closed when `jq` is missing
  - changes to `.claude/settings.json`
  - any change in `server/`, `client/`, `reviewer-core/` or `e2e/` code

## Decisions (user, 2026-10-08)

| # | Question | Decision |
|---|----------|----------|
| 1 | May test-writer create or edit e2e flows (`e2e/specs/NN-*.flow.json`)? | Yes |
| 2 | May test-writer extend `server/src/adapters/mocks.ts` (`Mock<Port>` test doubles)? | Yes. That is the only file under `src/` it may touch |
| 3 | May test-writer and doc-writer write `INSIGHTS.md`? | Yes |
| 4 | May doc-writer edit `specs/**` and `AGENTS.md`? | Yes. Exceptions: approved plans `specs/plans/YYYY-*.md` stay immutable (`specs/plans/README.md`), `CLAUDE.md` symlinks are never written, and `.claude/**` stays off-limits |
| 5 | Model for plan-verifier | `sonnet` |
| 6 | Separate spec | Yes. This file |

## Contracts

No Zod, DB, API or UI route changes.

New hook CLI contract: `.claude/hooks/guard-allowed-paths.sh <profile>`.

- **Input:** PreToolUse JSON on stdin.
- **Profiles:** `test-writer`, `doc-writer`.
- **Exit codes:** `0` allows the call. `2` blocks it, and stderr carries the reason and the
  allowed set.
- **Fails closed** on an unknown profile, missing `jq`, an empty path, a path outside the repo,
  a `..` segment, or a symlink.
- **Only judges `Edit|Write|MultiEdit|NotebookEdit`.** Any other tool exits 0.

## Agents

| Agent | Model | Writes | Bash | Hooks |
|-------|-------|--------|------|-------|
| test-writer | sonnet | test paths only (hook) | yes: run tests | `guard-allowed-paths.sh test-writer`, `guard-protected-paths.sh` |
| architecture-reviewer | opus | none | read-only (prompt) | `guard-protected-paths.sh` |
| plan-verifier | sonnet | none | runs plan verify commands | `guard-protected-paths.sh` |
| doc-writer | sonnet | Markdown docs only (hook) | **none** | `guard-allowed-paths.sh doc-writer` |

### test-writer allowlist

- `server/test/**` and `reviewer-core/test/**`
- `client/src/**/*.test.ts(x)` and `client/src/**/test-fixtures.ts`
- `server/src/adapters/mocks.ts`
- `e2e/specs/NN-*.flow.json`
- any `INSIGHTS.md`

### doc-writer allowlist (`.md` only)

- `docs/**` and `<pkg>/docs/**`
- `specs/**` and `<pkg>/specs/**`. `specs/plans/README.md` is allowed, but dated plan files are
  blocked.
- `README.md` files outside `.claude/` and `node_modules/`
- root and package `AGENTS.md`
- any `INSIGHTS.md`

### Pipeline

```
planner → plan approved → [test-writer: red phase, optional] → implementer
        → plan-verifier ∥ architecture-reviewer → doc-writer → human commits
code without tests → test-writer (backfill) → tests
```

## Acceptance criteria

- [ ] AC1: The four agent files exist. Their frontmatter parses, `name` equals the file stem, and
  model, tools, disallowed tools, skills and hooks match the table above.
- [ ] AC2: test-writer's Edit/Write is allowed only on its allowlist. Everything else exits 2,
  including other `server/src/**` files, `client/src/test/setup.ts`, `package.json`,
  `vitest.config.ts`, paths outside the repo, `..` paths, symlinks, an empty path, and an
  unknown profile. Proven by `.claude/hooks/tests/hooks.test.sh`.
- [ ] AC3: doc-writer's Edit/Write is allowed only on its allowlist. Source files, non-`.md`
  files, `.claude/**`, `CLAUDE.md` symlinks and dated plans exit 2. Proven by the harness.
- [ ] AC4: architecture-reviewer and plan-verifier have no write tool, and their Bash goes
  through `guard-protected-paths.sh`. Its messages no longer name only the implementer.
- [ ] AC5: every new agent has a Step 0 for unclear input, an "Output (exactly this shape)"
  template, and a "Before returning" checklist.
- [ ] AC6: every new agent cites its source IDs. The agents README lists every ID with URL, the
  fetch date 2026-10-08, and confidence caveats.
- [ ] AC7: the agents README has the new pipeline, a 7-row catalog, inputs/outputs, guardrails,
  sources, and the test-writer ↔ implementer decision.
- [ ] AC8: root `AGENTS.md` Documentation map and Workflow name the new agents. `CLAUDE.md` is
  still a symlink.
- [ ] AC9: the implementer runs tests already written by test-writer red and never rewrites
  their assertions.
- [ ] AC10: every path or `file:line` cited in new or changed Markdown exists.
- [ ] AC11: existing `guard-protected-paths.sh` behaviour is unchanged. Proven by regression
  cases in the harness.
- [ ] AC12: the `pr-self-review` routing table covers `.claude/agents/**` and `.claude/hooks/**`.

## Sources

Fetched 2026-10-08 by the `researcher` agent. The full rule → source mapping lives in the plan
and in `.claude/agents/README.md`.

- [S1] https://code.claude.com/docs/en/sub-agents
- [S2] https://code.claude.com/docs/en/best-practices
- [S5] https://code.claude.com/docs/en/hooks
- [T1] https://testing-library.com/docs/guiding-principles/
- [T2] https://testing-library.com/docs/queries/about/#priority
- [T3] https://fastify.dev/docs/latest/Guides/Testing/
- [T4] https://vitest.dev/guide/mocking.html
- [A1] https://github.com/anthropics/claude-code/blob/main/plugins/code-review/commands/code-review.md
- [A2] https://github.com/anthropics/claude-code/blob/main/plugins/pr-review-toolkit/agents/code-reviewer.md
- [A3] https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html
- [A4] https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/
- [A5] https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md
- [V1] https://www.docsie.io/blog/glossary/requirements-traceability-matrix/. Secondary: ISO/IEC/IEEE 29148-aligned practice.
- [V2] https://www.nasa.gov/wp-content/uploads/2018/09/nasa_systems_engineering_handbook_0.pdf. Search-summarized only.
- [D1] https://diataxis.fr/
- [D2] https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions
- [D3] https://c4model.com/
- [D4] https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams
- [D5] https://mermaid.js.org/intro/
- [D6] https://developers.google.com/style/highlights

## Links

- Plan: [`specs/plans/2026-10-08-quality-agents.md`](plans/2026-10-08-quality-agents.md)
- Agents map: [`.claude/agents/README.md`](../.claude/agents/README.md)
- Existing guard: [`.claude/hooks/guard-protected-paths.sh`](../.claude/hooks/guard-protected-paths.sh)
- Skill routing: [`.claude/skills/pr-self-review/SKILL.md`](../.claude/skills/pr-self-review/SKILL.md)
- Insight on one routing table: `INSIGHTS.md` entry 2026-10-07
