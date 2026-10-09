# Agents

Project subagents for DevDigest. Each agent is one Markdown file with YAML frontmatter
(configuration) and a body (system prompt). This README is the map of the set: who does what,
with which permissions, and what goes in and out. The rules themselves live in each agent file.
Read the file before you change an agent's behaviour.

## Pipeline

```
request ──► researcher ──► report [+ context pack ─► .claude/handoff/<slug>/context.md]   (optional)
request / spec [+ context pack] ──► planner ──► Development Plan (or decision questions first)
            ──► user approves ──► specs/plans/<date>-<slug>.md      (revisions come back as a delta)
specs/plans/*.md ──► [test-writer: red phase, optional] ──► implementer (one or more step ranges)
                   ──► .claude/handoff/<slug>/evidence.jsonl
                   ──► plan-verifier ∥ architecture-reviewer   (both start from scripts/diff-digest.sh)
                   ──► doc-writer ──► human commits
code without tests ──► test-writer (backfill) ──► tests
```

### Token budget (2026-10-08)

The Intent Layer run cost ≈ 1.16 M subagent tokens. Most of it was the same data read or written
more than once. The rules below remove that duplication. No check is removed: every gate still
runs, and the verifier still re-runs everything the diff touched.

| Rule | Where it lives |
|------|----------------|
| The planner does its own repo context. Run `researcher` on the repo only for a separate question, or to produce a **context pack** the planner uses as its map | `planner.md` Step 1, `researcher.md` Step 3 |
| Design forks are asked **before** the plan (decision gate); revisions return a **delta** | `planner.md` Step 0, Revision mode |
| Plans aim for ≤ 20 KB: no skill map, no copied research, no absolute path lists | `planner.md` Step 3 |
| Research reports aim for ≤ 8 KB, at most 5 excerpts | `researcher.md` Step 3 |
| A large plan runs as several implementer sessions over step ranges, each with a fresh context | `implementer.md` Step 0 |
| Gates are logged with a tree fingerprint (`scripts/tree-fingerprint.sh`); the verifier re-runs every touched test and accepts a log line only for untouched suites on an identical tree | `implementer.md` Evidence log, `plan-verifier.md` Step 2 |
| Reviewers start from `scripts/diff-digest.sh` and open full hunks only for candidates | `architecture-reviewer.md` Step 1, `plan-verifier.md` Step 2 |
| Cheaper models where the work is mechanical: `architecture-reviewer` runs on `sonnet`; pass `model: haiku` for source-gathering external research and for doc-writer edits that only update a README API map or INSIGHTS entries | frontmatter; per-call override by the caller |

There is no `security-reviewer` agent yet — security review stays manual until one is added.

Each agent can only answer through its final report, because a subagent has no
`AskUserQuestion` tool. That is why every agent starts with a **Step 0**: if the input is unclear
or missing, it returns clarifying questions (or status `blocked`) and does no work.

## Catalog

| Agent | Responsibility | Model | Tools (allow) | Denied | Preloaded skills | Hooks |
|-------|----------------|-------|---------------|--------|------------------|-------|
| [researcher](researcher.md) | Answers one question with evidence. **Repo** research (code, history, docs), **external** research (docs, standards, prior art), or both. Never changes anything | `sonnet` | Read, Grep, Glob, Bash *(read-only by prompt)*, WebSearch, WebFetch | Write, Edit, NotebookEdit, Skill, Agent, Workflow | — | — |
| [planner](planner.md) | Turns a feature request or spec into a step-by-step Development Plan: files, tests first, verify commands, and the skills to use in each step. Read-only, saves nothing | `opus` | Read, Grep, Glob, Bash *(read-only by prompt)* | Write, Edit, NotebookEdit, Agent, Workflow, WebSearch, WebFetch | onion-architecture, frontend-architecture, test-strategy, shared-contracts, engineering-insights | — |
| [implementer](implementer.md) | Executes an approved plan exactly, step by step: red → green → verify. Records insights and reports honestly. Does not plan, review, or commit | `sonnet` | Read, Edit, Write, Bash, Grep, Glob, Skill | NotebookEdit, Agent, Workflow, WebSearch, WebFetch | test-strategy, engineering-insights *(loads the other skills each step names)* | `PreToolUse` on `Edit\|Write\|Bash` → [`../hooks/guard-protected-paths.sh`](../hooks/guard-protected-paths.sh) |
| [test-writer](test-writer.md) | Writes or backfills tests (server vitest/`.it.test.ts`, reviewer-core, client RTL, e2e flows), as an optional red phase before the implementer or for existing untested code. Never writes implementation code | `sonnet` | Read, Edit, Write, Bash, Grep, Glob, Skill | NotebookEdit, Agent, Workflow, WebSearch, WebFetch | test-strategy, engineering-insights | `PreToolUse` on `Edit\|Write` → [`../hooks/guard-allowed-paths.sh test-writer`](../hooks/guard-allowed-paths.sh); on `Edit\|Write\|Bash` → `guard-protected-paths.sh` |
| [architecture-reviewer](architecture-reviewer.md) | Checks a diff against onion layering, client/server/reviewer-core isolation, the `vendor/shared` mirror and placement-by-reuse. Read-only, evidence-backed findings only | `sonnet` | Read, Grep, Glob, Bash | Write, Edit, NotebookEdit, Agent, Workflow, WebSearch, WebFetch | onion-architecture, frontend-architecture, shared-contracts | `PreToolUse` on `Bash` → `guard-protected-paths.sh` |
| [plan-verifier](plan-verifier.md) | Verifies a working tree against every item of an approved plan and its spec; re-runs the plan's verify commands and returns a traceability matrix. Read-only, no style/architecture/security advice | `sonnet` | Read, Grep, Glob, Bash | Write, Edit, NotebookEdit, Agent, Workflow, WebSearch, WebFetch | test-strategy | `PreToolUse` on `Bash` → `guard-protected-paths.sh` |
| [doc-writer](doc-writer.md) | Documents implemented work from a plan/spec/diff/notes: classifies each page (Diátaxis), places it deterministically, adds Mermaid diagrams, verifies claims against code. Markdown docs only | `sonnet` | Read, Edit, Write, Grep, Glob, Skill | Bash, NotebookEdit, Agent, Workflow, WebSearch, WebFetch | mermaid-diagram, engineering-insights | `PreToolUse` on `Edit\|Write` → [`../hooks/guard-allowed-paths.sh doc-writer`](../hooks/guard-allowed-paths.sh) |

No agent may spawn other agents or workflows (`Agent` and `Workflow` are denied everywhere).
Architecture and security review are **out of scope** for all seven. Architecture review is done
by `architecture-reviewer` with a fresh context; security review has no dedicated agent yet.

## Inputs and outputs

| Agent | Input | Output | Where the output goes |
|-------|-------|--------|-----------------------|
| researcher | One concrete question + scope (repo / external / both) + done criterion | *Repo research report* or *External research report*: TL;DR, Findings with confidence (`confirmed` / `likely` / `uncertain`), Evidence (`file:line` or URL + quote), **Not found**, follow-ups; optional **Context pack** (≤ 40 fact rows) when the research feeds a plan | Returned to the caller as text. The caller saves a context pack to `.claude/handoff/<slug>/context.md` |
| planner | Feature request and/or spec (`specs/LNN-*.md`, `<pkg>/specs/`), optional context pack, plus the repo at `HEAD`; for a revision, the plan + decisions | **Development Plan**: Goal, ACs mapped to tests, Key constraints, Contract & data changes, Steps `S1…Sn` (skills · files · test first · implement · verify · depends on), Verification matrix, Risks, Out of scope — or decision questions; a revision returns a delta | Returned as text. The main session saves it to [`specs/plans/`](../../specs/plans/README.md) **after the user approves it** |
| implementer | An approved plan (`specs/plans/*.md` path or the plan text), optionally a step range. The base commit must be an ancestor of `HEAD` | Code + tests in the working tree (**uncommitted**), entries in the module `INSIGHTS.md`, the evidence log `.claude/handoff/<slug>/evidence.jsonl`, and an **Implementation Report**: per-step status, checks run, AC evidence, deviations, blocked items, handoff to reviewers | Working tree + report to the caller. A human reviews and commits |
| test-writer | A plan path + step IDs (red phase), or a target code path + behaviours to pin (backfill) | **Test Report**: Mode, Plan/target, Base, Status, Tests table, AC coverage, Needs from implementer, Not run, Insights recorded | New/changed test files in the working tree (hook-limited paths) + report to the caller |
| architecture-reviewer | A base ref, branch, or plan path (default: merge-base with `main`) | **Architecture Review**: scope, Verdict, Critical/Important findings tables, Rules checked, discarded candidates, Not checked | Returned as text. No file changes — the agent has no write tool |
| plan-verifier | An approved plan path (+ the spec it links to); optionally an implementer report and evidence log | **Plan Verification**: Plan/Spec/Base→HEAD, Verdict, traceability matrix (`met (logged)` for fingerprint-matched log lines), Commands run, Unplanned changes, Out-of-scope violations, contradicted claims, Plan gaps | Returned as text. No file changes — the agent has no write tool |
| doc-writer | A plan, spec, diff or notes, plus the reader's question | **Documentation Report**: Pages (path/Diátaxis type/placement row/diagrams), Claims verified, Dropped claims, Index READMEs updated, Proposed edits outside my scope, Insights | New/changed Markdown docs in the working tree (hook-limited paths) + report to the caller |

## Guardrails

Some rules are enforced by configuration. Others exist only in the prompt.

| Guardrail | Enforced by |
|-----------|-------------|
| researcher and planner cannot write files | `disallowedTools: Write, Edit, NotebookEdit` |
| Bash stays read-only for researcher and planner (no `>`, `tee`, installs, migrations, servers) | Prompt only. A tool denylist cannot filter Bash commands |
| implementer cannot hand-edit migrations, lock files, `.env` or `secrets.json`, run `docker compose down -v`, `git commit/push`, `reset --hard`, `clean -f`, or `psql -f migrations/` | `guard-protected-paths.sh` (exit 2 blocks the call) |
| implementer stays inside the plan's files, never weakens a test, stops after 3 failed attempts on one error, never reports a gate it did not run as passed | Prompt only |
| test-writer and doc-writer write limits (test paths only / Markdown docs only) | `guard-allowed-paths.sh <profile>` (exit 2 blocks the call) |
| test-writer cannot write source via Bash (`cat >`, `sed -i`) | Prompt only — Bash has no path-aware guard |
| architecture-reviewer and plan-verifier have no write tool; their Bash stays read-only | `disallowedTools: Write, Edit, NotebookEdit` + prompt (read-only commands) + `guard-protected-paths.sh` as a backstop |
| doc-writer has no Bash at all | `disallowedTools: Bash` |
| Insights are recorded every session | `engineering-insights` skill (preloaded) + the project Stop hook `insights-reminder.sh` |

**test-writer vs. implementer.** test-writer is used for backfill on existing code, and
optionally for the red phase of a plan step — the Writer/Reviewer split [S2]. In a red phase the
implementer runs the tests test-writer wrote and implements to green without rewriting them
(`implementer.md` Step 1, "Red"; `test-writer.md` "Relationship with the implementer"). Outside a
red phase, the implementer still writes its own tests for the steps it executes.

**Why one allowlist hook.** `guard-allowed-paths.sh` serves both path-limited writers instead of
one script per agent: path normalisation (root stripping, `..`, symlinks, fail-closed behaviour)
is the risky part and must be identical for every writer, so it is tested once; the policy per
agent is one `case` block keyed by `$1` (`guard-allowed-paths.sh:43`). A third writer agent costs
one profile plus a few test rows, not a new script.

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

## Sources behind test-writer, architecture-reviewer, plan-verifier and doc-writer

Fetched 2026-10-08 by the `researcher` agent:

- **[T1]** Guiding Principles — <https://testing-library.com/docs/guiding-principles/> (official)
- **[T2]** Priority — <https://testing-library.com/docs/queries/about/#priority> (official)
- **[T3]** Testing — Fastify — <https://fastify.dev/docs/latest/Guides/Testing/> (official)
- **[T4]** Mocking — Vitest — <https://vitest.dev/guide/mocking.html> (official)
- **[A1]** `code-review` command — <https://github.com/anthropics/claude-code/blob/main/plugins/code-review/commands/code-review.md> (official plugin)
- **[A2]** `code-reviewer` agent — <https://github.com/anthropics/claude-code/blob/main/plugins/pr-review-toolkit/agents/code-reviewer.md> (official plugin)
- **[A3]** The Clean Architecture — <https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html> (secondary, widely cited)
- **[A4]** The Onion Architecture, part 1 — <https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/> (secondary, widely cited)
- **[A5]** dependency-cruiser rules reference — <https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md> (secondary tool docs)
- **[V1]** Requirements traceability matrix — <https://www.docsie.io/blog/glossary/requirements-traceability-matrix/> — secondary; confidence `likely`, loosely aligned with ISO/IEC/IEEE 29148 practice, not independently verified against the standard text
- **[V2]** NASA Systems Engineering Handbook — <https://www.nasa.gov/wp-content/uploads/2018/09/nasa_systems_engineering_handbook_0.pdf> — search-summarized only, not read in full; confidence `uncertain`
- **[D1]** Diátaxis — <https://diataxis.fr/> (official)
- **[D2]** Documenting architecture decisions — <https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions> (primary ADR source, Michael Nygard)
- **[D3]** C4 model — <https://c4model.com/> (official)
- **[D4]** Creating diagrams (GitHub docs) — <https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams> (official)
- **[D5]** Mermaid — <https://mermaid.js.org/intro/> (official)
- **[D6]** Google developer documentation style highlights — <https://developers.google.com/style/highlights> (official)

| Rule | test-writer | architecture-reviewer | plan-verifier | doc-writer |
|------|-------------|------------------------|----------------|------------|
| Assert behaviour, not internals | T1 | — | — | — |
| Query priority (`getByRole` first, `getByTestId` last) | T2 | — | — | — |
| `buildApp` + `app.inject` for server routes | T3 | — | — | — |
| `vi.mock` is hoisted; partial mocks miss internal calls | T4 | — | — | — |
| Validate each candidate; confidence threshold ≥ 80 | — | A1, A2 | — | — |
| Dependencies/coupling point inward | — | A3, A4 | — | — |
| From→to rule style | — | A5 | — | — |
| Coverage ≠ verification; traceability matrix | — | — | V1 | — |
| Method per item: Test/Analysis/Inspection/Demonstration | — | — | V2 | — |
| Page type (tutorial/how-to/reference/explanation) | — | — | — | D1 |
| ADR shape: Title/Status/Context/Decision/Consequences | — | — | — | D2 |
| Shallowest C4 level that answers the question | — | — | — | D3 |
| Diagram type choice (sequence/flowchart/ER/state) | — | — | — | D4, D5 |
| Second person, active voice, descriptive links | — | — | — | D6 |

**Not from external sources.** The model choices (`sonnet` for all four — architecture-reviewer
moved from `opus` on 2026-10-08, see "Token budget"; originally `sonnet` for the other three — decision 5 for plan-verifier), the B1–B16 rule table, the doc-writer placement
table, the `met`/`partially met`/`not met`/`cannot verify` status vocabulary, and user decisions
1–4 in `specs/XX-quality-agents.md` ("Decisions") are repo conventions, not from a cited source.

## Adding or changing an agent

- One file per agent, `kebab-case.md`. `name` in the frontmatter must match the file name.
- Start with the smallest tool set that works. Deny `Agent` and `Workflow` unless the agent really
  orchestrates other agents.
- Enforce "never do X" with a hook when you can, not only in the prompt.
- Give the agent a fixed output template and a Step 0 for unclear input.
- Update the catalog and the inputs/outputs tables above in the same change.
- A path-limited writer gets a profile in `guard-allowed-paths.sh` plus rows in
  `.claude/hooks/tests/hooks.test.sh`.
