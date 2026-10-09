# Agents

Project subagents for DevDigest. Each agent is one Markdown file with YAML frontmatter
(configuration) and a body (system prompt). This README is the map of the set: who does what,
with which permissions, and what goes in and out. The rules themselves live in each agent file.
Read the file before you change an agent's behaviour.

## Pipeline

```
request ──► researcher ──► report            (optional: evidence first)
request / spec ──► planner ──► Development Plan ──► user approves ──► specs/plans/<date>-<slug>.md
specs/plans/*.md ──► implementer ──► code + tests + Implementation Report ──► reviewers ──► human commits
```

Each agent can only answer through its final report, because a subagent has no
`AskUserQuestion` tool. That is why every agent starts with a **Step 0**: if the input is unclear
or missing, it returns clarifying questions (or status `blocked`) and does no work.

## Catalog

| Agent | Responsibility | Model | Tools (allow) | Denied | Preloaded skills | Hooks |
|-------|----------------|-------|---------------|--------|------------------|-------|
| [researcher](researcher.md) | Answers one question with evidence. **Repo** research (code, history, docs), **external** research (docs, standards, prior art), or both. Never changes anything | `sonnet` | Read, Grep, Glob, Bash *(read-only by prompt)*, WebSearch, WebFetch | Write, Edit, NotebookEdit, Skill, Agent, Workflow | — | — |
| [planner](planner.md) | Turns a feature request or spec into a step-by-step Development Plan: files, tests first, verify commands, and the skills to use in each step. Read-only, saves nothing | `opus` | Read, Grep, Glob, Bash *(read-only by prompt)* | Write, Edit, NotebookEdit, Agent, Workflow, WebSearch, WebFetch | onion-architecture, frontend-architecture, test-strategy, shared-contracts, engineering-insights | — |
| [implementer](implementer.md) | Executes an approved plan exactly, step by step: red → green → verify. Records insights and reports honestly. Does not plan, review, or commit | `sonnet` | Read, Edit, Write, Bash, Grep, Glob, Skill | NotebookEdit, Agent, Workflow, WebSearch, WebFetch | test-strategy, engineering-insights *(loads the other skills each step names)* | `PreToolUse` on `Edit\|Write\|Bash` → [`../hooks/guard-protected-paths.sh`](../hooks/guard-protected-paths.sh) |

No agent may spawn other agents or workflows (`Agent` and `Workflow` are denied everywhere).
Architecture and security review are **out of scope** for all three. They are done by separate
reviewer agents with a fresh context.

## Inputs and outputs

| Agent | Input | Output | Where the output goes |
|-------|-------|--------|-----------------------|
| researcher | One concrete question + scope (repo / external / both) + done criterion | *Repo research report* or *External research report*: TL;DR, Findings with confidence (`confirmed` / `likely` / `uncertain`), Evidence (`file:line` or URL + quote), **Not found**, follow-ups | Returned to the caller as text. It is not saved by default |
| planner | Feature request and/or spec (`specs/LNN-*.md`, `<pkg>/specs/`), plus the repo at `HEAD` | **Development Plan**: Goal, ACs mapped to tests, Context applied, Contract & data changes, Steps `S1…Sn` (skills · files · test first · implement · verify · depends on), Skill map, Verification matrix, Risks, Out of scope | Returned as text. The main session saves it to [`specs/plans/`](../../specs/plans/README.md) **after the user approves it** |
| implementer | An approved plan (`specs/plans/*.md` path or the plan text). The base commit must be an ancestor of `HEAD` | Code + tests in the working tree (**uncommitted**), entries in the module `INSIGHTS.md`, and an **Implementation Report**: per-step status, checks run, AC evidence, deviations, blocked items, handoff to reviewers | Working tree + report to the caller. A human reviews and commits |

## Guardrails

Some rules are enforced by configuration. Others exist only in the prompt.

| Guardrail | Enforced by |
|-----------|-------------|
| researcher and planner cannot write files | `disallowedTools: Write, Edit, NotebookEdit` |
| Bash stays read-only for researcher and planner (no `>`, `tee`, installs, migrations, servers) | Prompt only. A tool denylist cannot filter Bash commands |
| implementer cannot hand-edit migrations, lock files, `.env` or `secrets.json`, run `docker compose down -v`, `git commit/push`, `reset --hard`, `clean -f`, or `psql -f migrations/` | `guard-protected-paths.sh` (exit 2 blocks the call) |
| implementer stays inside the plan's files, never weakens a test, stops after 3 failed attempts on one error, never reports a gate it did not run as passed | Prompt only |
| Insights are recorded every session | `engineering-insights` skill (preloaded) + the project Stop hook `insights-reminder.sh` |

## Sources behind the planner and implementer rules

Primary sources, fetched 2026-10-07 by the `researcher` agent:

- **[S1]** Create custom subagents — <https://code.claude.com/docs/en/sub-agents> (official)
- **[S2]** Best practices for Claude Code — <https://code.claude.com/docs/en/best-practices> (official)
- **[S3]** Skill authoring best practices — <https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices> (official)
- **[S4]** Community guides on agent chaining (Tembo.io, elegantsoftwaresolutions.com) — secondary, not independently verified; confidence `likely`

| Rule | Source | planner | implementer |
|------|--------|---------|-------------|
| `description` says *when* to delegate and what the agent will not do | S1, S3 | frontmatter `description` | frontmatter `description` |
| Least privilege: `tools` allowlist plus `disallowedTools` denylist (the denylist is applied first) | S1 | no write tools | write tools, but no Agent/Workflow/Web |
| Preload the needed skills with `skills:` (full content injected at start) | S1 | 5 architecture/test skills | test-strategy, engineering-insights |
| Subagents cannot ask the user, so they return questions or `blocked` | S1 | Step 0 *Clarifying questions* | Step 0 *Preconditions* |
| Separate the phases Explore → Plan → Code → Commit | S2 | Step 1 *Gather context* before any step, no changes | does not plan, does not commit (hook-enforced) |
| Hand off through a plan file and execute it in a fresh context | S2 | plan saved to `specs/plans/` after approval | input is the plan only, checked against the tree |
| Give the agent a check it can run (tests/build as pass/fail) | S2 | every step has *Test first* + *Verify* with a real command | red → green → verify per step, final verification matrix |
| Independent review in a separate fresh context | S2 | *Out of scope* lists items for reviewers | *Handoff to reviewers* section, no review verdicts |
| Degrees of freedom: exact commands for fragile steps, prose for judgment | S3 | exact verify commands, design rules as prose | migrations only via `pnpm db:generate --name …` → `pnpm db:migrate` |
| Per-agent `hooks` in frontmatter | S1 | — | `PreToolUse` guard |
| Each agent has one goal, a fixed output shape, and a human gate between steps | S4 | fixed plan template, user approval | fixed report template, human commits |

**Not from external sources.** These are repo conventions from [`AGENTS.md`](../../AGENTS.md)
and the skills: reading `AGENTS.md`/`INSIGHTS.md`, the skill routing table in
[`pr-self-review`](../skills/pr-self-review/SKILL.md), mirroring `vendor/shared`, and recording
insights. These are design choices made without a cited source: the model split (`opus` for
planning, `sonnet` for the rest), the 3-attempt stop rule, and "not run ≠ passed". The researcher
predates the external research. Its tool configuration was later confirmed to match S1.

**Deliberate deviations from the sources.** S1 and S2 suggest that the planner writes the plan file
itself. Here it stays fully read-only, so the user approves the plan before it lands in the repo.
`permissionMode` (`plan` / `acceptEdits`, S1) is not used. Tool lists and the guard hook do that job.

## Adding or changing an agent

- One file per agent, `kebab-case.md`. `name` in the frontmatter must match the file name.
- Start with the smallest tool set that works. Deny `Agent` and `Workflow` unless the agent really
  orchestrates other agents.
- Enforce "never do X" with a hook when you can, not only in the prompt.
- Give the agent a fixed output template and a Step 0 for unclear input.
- Update the catalog and the inputs/outputs tables above in the same change.
