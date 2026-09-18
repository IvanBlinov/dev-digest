---
name: engineering-insights
description: "Capture engineering insights discovered during ANY task in this repo and record them in the INSIGHTS.md of the module being worked on (server, client, reviewer-core, e2e, or root). Applies automatically in every session — no explicit request needed. Triggers whenever you hit a Pitfall, Non-obvious behaviour, Architectural decision, Performance or Security finding while reading, debugging, testing or changing code. Every entry needs a date and a file:line proof."
---

# Engineering Insights

This skill is **always on**. It is not a feature you are asked to use; it is part of finishing
any task in this repository. The root `CLAUDE.md` mandates it and a Stop hook checks it.

## The rule

> When you learn something about this codebase that is **not derivable from reading the code in
> five minutes** and **would change how the next agent or engineer works**, write it down
> **immediately** — in the `INSIGHTS.md` of the module you are working in — with the date and a
> `file:line` proof. Do not wait for the end of the task.

Before ending any task, state one of:
- `insights recorded: <file> — <N> entries` (list the titles), or
- `insights: none` (you checked and nothing met the bar).

## Rubrics

Every entry is tagged with exactly one rubric.

| Rubric | Record when… | Not an insight when… |
|--------|--------------|----------------------|
| **Pitfall** | A mistake is easy to make and costly: a command that destroys data, a step that must run manually, a test that passes for the wrong reason. | It is already an error message the tooling prints clearly. |
| **Non-obvious behaviour** | Code does something a reader would not expect from its name, location or docs; docs and code disagree; a default silently changes behaviour. | The behaviour is stated in a docblock right above the code. |
| **Architectural decision** | A structural choice with consequences: why a boundary exists, why a package is source-only, why a single-instance assumption holds, what would break if it changed. | It is ordinary framework idiom (e.g. "Fastify uses plugins"). |
| **Performance** | A measured or clearly reasoned cost: N+1, per-file LLM calls, an index that matters, a cache that must be warmed, a hot path. | It is a guess without a number or a mechanism. |
| **Security** | Trust boundaries, injection surfaces, secret handling, rate limits, what is deliberately NOT done and why. Never include secret values or exploit steps. | It is generic OWASP advice not tied to this code. |

The quality bar, for all rubrics: **specific, provable, actionable.** If you cannot point at a
`file:line`, you do not have an insight yet — go find the line.

## Where to write (module routing)

Decide by the path of the files you are reading or editing:

| You are working in… | Write to |
|---------------------|----------|
| `server/**` | `server/INSIGHTS.md` |
| `client/**` | `client/INSIGHTS.md` |
| `reviewer-core/**` | `reviewer-core/INSIGHTS.md` |
| `e2e/**` | `e2e/INSIGHTS.md` |
| root files, `scripts/`, `docs/`, `.github/`, or a finding that spans two or more packages | `INSIGHTS.md` (root) |

If a finding is discovered in one package but its cause lives in another (e.g. a client bug
caused by a server contract), write it in the package where the **rule** must be applied, and
cite proof lines from both.

## Entry format

Newest entries at the top, directly under the file's intro paragraph. One entry = one fact.

```markdown
## YYYY-MM-DD — [Rubric] Short imperative or declarative title
Symptom: what you observed (one line).
Cause: why it happens (one line).
Rule: what to do / not do from now on (one line).
Proof: `path/from/repo/root.ts:LINE` (+ `other/file.ts:LINE` if needed)
```

For **Architectural decision** use `Context / Decision / Consequence / Proof` instead of
`Symptom / Cause / Rule / Proof`.

Rules for the fields:
- **Date**: today, ISO `YYYY-MM-DD`.
- **Rubric**: exactly one of `Pitfall`, `Non-obvious behaviour`, `Architectural decision`, `Performance`, `Security`.
- **Proof**: at least one `file:line` relative to the repo root, pointing at the code that makes the statement true. Cite a commit hash in addition when the fact is about history.
- Language: **English**, matching the existing files.
- No secrets, no absolute paths under a home directory, no customer data.

## Procedure

1. **Notice.** While reading, debugging, testing or editing, ask: "would I have wanted to know this before I started?" If yes, classify it against the rubrics table.
2. **Prove.** Find the exact `file:line`. Re-read it; make sure the claim is true right now, not from memory.
3. **Dedupe.** Open the target `INSIGHTS.md` and search for the same topic. If an entry exists, update its `Proof`/`Rule` and refresh the date instead of adding a duplicate.
4. **Write.** Insert the entry at the top using the format above. Use the Edit tool; do not rewrite the whole file.
5. **Report.** In your final message for the task, list what you recorded (or `insights: none`).

## Anti-patterns

- Writing "insights" that restate a README paragraph — link to the README instead.
- Batching everything to the end of the session — the Stop hook is a safety net, not the workflow.
- Entries without a `Proof` line.
- Putting a server finding into root `INSIGHTS.md` because it was "easier".
- Recording a guess ("this is probably slow") — measure or trace the mechanism first.

See [examples.md](examples.md) for good and bad entries per rubric.
