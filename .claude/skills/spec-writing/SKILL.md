---
name: spec-writing
description: Use when writing, reviewing or reading a DevDigest feature spec for Spec Driven Development — the spec template (Spec ID, Status, EARS acceptance criteria, edge cases, NFRs, inputs and provenance, untrusted inputs, open questions), where a spec file goes and how it is named, and the checklist for analysing designs (screenshots, text briefs) for missing states, corner cases, cross-module communication and UX improvements.
---

# Spec writing (Spec Driven Development)

A spec says **what** a feature must do and **how we will know it does it**. It never says how to
build it — that is the implementation planner's Development Plan. Every acceptance criterion must be checkable
by a test or a demonstration.

Who uses this skill:
- `spec-writer` agent — writes and revises draft specs.
- `implementation-planner` — reviews an approved spec's requirements, then turns it into a plan;
  each plan step traces to an `AC-N`. It never edits the spec; its spec-changing recommendations
  come back to `spec-writer`.
- `plan-verifier` — checks each `AC-N` against the working tree.

## 1. Placement and naming

| Feature touches | Folder |
|---|---|
| one package | that package's `specs/`: `server/specs/`, `client/specs/`, `reviewer-core/specs/`, `mcp/specs/` |
| more than one package | root `specs/` |

- File name: `LNN-short-name.md` (course lesson, e.g. `L05-reading-path.md`; a sub-feature may add a
  letter, `L05b-…`) or `XX-short-name.md` when there is no lesson.
- Never write into `specs/plans/` (approved plans, implementation-planner output), `e2e/specs/` (flow JSON) or a
  folder `README.md` (doc-writer-owned). The `spec-writer` hook enforces all of this.
- **Spec ID:** `SPEC-NN`, one running number across every spec folder. Take the highest
  `Spec ID: SPEC-NN` found by `Grep "^Spec ID: SPEC-" in specs/ and */specs/` and add 1; start at
  `SPEC-01` if none exists. Legacy specs without a Spec ID keep none.

## 2. Status lifecycle

| Status | Set by | Meaning |
|---|---|---|
| `draft` | spec-writer | Being written; the only status spec-writer may write or edit |
| `approved` | main session, only after the user's explicit OK | Frozen input for the implementation planner |
| `implemented` | doc-writer, at the end of the pipeline | Built and verified |

A change to an `approved` or `implemented` spec is a **new** spec with
`Supersedes: <path of the old spec>`; the old file is never edited by spec-writer. Legacy specs
without a `Status:` line count as approved.

## 3. Template

Write in English. Keep every section; write `None.` when a section is truly empty, so a reader
knows it was considered.

```markdown
# Spec: <feature name>
Spec ID: SPEC-NN
Status: draft
Supersedes: <path of the replaced spec, or "—">

## Problem and user
Who has the problem, in which situation, and what it costs them today. One short paragraph;
name the screen, command or API they use.

## Goals / Non-goals
Goals: user-visible outcomes, each one checkable.
Non-goals: what is deliberately left out (and, when useful, which later spec covers it).

## User stories
- As a <role>, I want <capability>, so that <benefit>.

## Acceptance criteria (EARS)
- AC-1 — <EARS requirement>
- AC-2 — …

## Edge cases
- EC-1 — <situation> → <required behaviour, or the AC that covers it>

## Non-functional requirements
- NFR-1 — <performance, limits, accessibility, i18n, observability, security, cost>, each with a number or a check.

## Inputs and provenance
| Input | Source (table / route / adapter / model / user) | Freshness / owner |
|---|---|---|

## Untrusted inputs
| Input | Who controls it | Required handling |
|---|---|---|

## Open questions
- Q-1 — <question> · options: <A / B> · recommended: <A, because …>
```

### What each section must contain

- **Problem and user** — a real person in a real flow. No solution wording.
- **Goals / Non-goals** — Non-goals stop scope creep. List the things a reader could reasonably
  expect but will not get.
- **User stories** — one per role or flow. Every story is covered by at least one AC.
- **Acceptance criteria** — section 4. Numbered `AC-1…`; numbers are never reused after removal.
- **Edge cases** — empty, error, partial, huge, concurrent, permission and stale-data cases from the
  checklist in section 5. Each one either points at an AC or states its own required behaviour.
- **Non-functional requirements** — measurable. "Fast" is not an NFR; "the route answers in
  ≤ 300 ms p95 on the seeded repo" is. Include limits and where they come from (a constant, a
  contract), accessibility (keyboard, labels), i18n (strings in `client/messages`), and logs.
- **Inputs and provenance** — every piece of data the feature reads: DB table, API route, GitHub,
  repo index, LLM output, user input, config. Where it comes from, who produces it, how fresh it
  is (indexed at clone time? cached 10 min? per request?).
- **Untrusted inputs** — the subset an outsider, the PR author or a model controls (PR title/body,
  diff, file paths, symbol names, LLM output, imported URLs). For each: the required handling —
  validated by a Zod contract, rendered as plain text (no Markdown/HTML), fenced as untrusted
  data, length-capped, never executed or used to build a prompt without the injection guard.
- **Open questions** — what the user has not decided yet. Each has options and a recommended
  answer. An approved spec has none left, or each remaining one is explicitly deferred.

## 4. EARS acceptance criteria

EARS (Easy Approach to Requirements Syntax; Mavin et al., Rolls-Royce, IEEE RE'09) separates the
condition from the system's response. One requirement per AC; `shall` marks it as mandatory.

| Pattern | Shape | Example |
|---|---|---|
| Ubiquitous | The system shall <response>. | The system shall log every authentication attempt. |
| Event-driven | WHEN <trigger>, the system shall <response>. | WHEN the user submits the login form, the system shall validate the credentials. |
| State-driven | WHILE <state>, the system shall <response>. | WHILE a repo sync is running, the system shall show its progress. |
| Unwanted behaviour | IF <unwanted condition>, THEN the system shall <response>. | IF validation fails three times within 60 seconds, THEN the system shall lock the account temporarily. |
| Optional feature | WHERE <feature is enabled>, the system shall <response>. | WHERE MFA is enabled, the system shall require a TOTP code after the password. |

Patterns may be combined in a fixed order: `WHERE … WHILE … WHEN … the system shall …`, or
`IF … THEN …` for the unwanted case.

Rules:
- Name the actual system part when it helps: "the PR Overview tab shall …", "`GET /pulls/:id/blast` shall …".
- The response is **observable**: a UI state, a response field, a status code, a log line, a file.
- Use numbers, not adjectives. Name the limit and its source.
- No implementation detail (library, class name) unless it is part of the contract (route path,
  Zod schema name, i18n key, MCP tool name).
- One behaviour per AC. If you write "and", check whether it is two ACs.
- Every IF-THEN (unwanted behaviour) needs a user-visible outcome — never only "handle the error".

Vague → testable:

| Vague | Testable |
|---|---|
| "Should work fine on big repositories" | WHEN the repository exceeds the indexing threshold, the system shall build the overview from deterministic facts only, without reading every file in full. |
| "Should not crash if the model is down" | IF the structured model call fails, THEN the system shall show the deterministic overview with the degradation reason. |
| "Should hint where to start reading" | The system shall order the reading path by file rank in the import graph. |

## 5. Design analysis checklist

Use this on every design input (screenshots, mockups, text briefs) **before** writing ACs. Every
finding becomes an AC, an edge case, an NFR, or an open question with a recommended answer.

**States the design may not show**
- Empty (no data yet), loading, error with retry, partial / degraded (with the reason), stale data.
- One item vs many items; very long names, paths and text (truncation + full value on hover/focus).
- First run / not configured; feature flag off; no permission.
- What happens on refresh, back navigation, and a direct link to the screen.

**Interaction**
- Every control: what it does, its default, whether the choice persists (URL, local, none).
- Keyboard and focus order; accessible names (`aria-label`, `aria-pressed`, roles).
- Narrow screens: what wraps, what scrolls, what hides.
- Destructive or expensive actions (LLM calls, resync, delete): confirmation, cost, rate limit.

**Data and limits**
- Where each number on screen comes from (an existing field? a new contract field?).
- Limits and caps: value, owner (constant / contract), and what the user sees when hit.
- Sorting and grouping rules; ties.
- Freshness: when the data was produced and how the user can refresh it.

**Cross-module communication**
- Which package owns each part: server route/service, `@devdigest/shared` contract (server copy
  first, client mirror), client hook/component, reviewer-core prompt, MCP tool, e2e flow.
- The contract between them: route + method, Zod schema, optional vs nullable fields, error envelope.
- What each consumer does when the other side is down, slow, or returns degraded data.
- Whether the MCP tool and the UI must show the same answer (they usually should, from one route).

**UX improvements**
- Anything that would make the flow faster, clearer or safer than the design: better defaults,
  one fewer click, an explanation of a degraded state, a link to the source (GitHub `file:line`).
- Mark these as **proposals**, never as requirements, until the user accepts them.

**Untrusted data on screen**
- Any text from a PR author, repo, or model: rendered as plain text, length-capped, never as HTML.

## 6. Quality gate (before a spec is handed over)

- [ ] Header complete: Spec ID unique, `Status: draft`, `Supersedes` filled or `—`.
- [ ] Every user story is covered by at least one AC; every AC uses an EARS pattern and `shall`.
- [ ] Every AC is observable and has no vague words (fast, nice, properly, user-friendly, etc.).
- [ ] Every design state from section 5 is an AC, an edge case, or an open question.
- [ ] Every limit names its value and its source.
- [ ] Inputs table lists every data source; untrusted inputs each have a handling rule.
- [ ] Cross-module features name the package and contract for each part.
- [ ] Non-goals name what a reader would otherwise expect.
- [ ] Open questions each have options and a recommended answer.
- [ ] No implementation plan (files, steps, classes) — that belongs to the implementation planner.
