---
name: implement
description: Run an approved DevDigest implementation plan end to end in Spec Driven Development style — implementer (single run or step ranges), architecture review, a fix loop where the user triages findings (max 3 rounds), final gates, plan-verifier — and stop before commit. Use only when the user types /implement with a plan from specs/plans/. Spec-writer and implementation-planner are run by hand before this, never from here.
argument-hint: <specs/plans/plan.md> ["extra hints"] [--design <image>]… | --resume <slug>
disable-model-invocation: true
---

# /implement — run an approved plan

You are the **orchestrator** in the main session. You start subagents, keep a small state file,
and stop at the decision points to ask the user. You never write feature code yourself, never
read diffs or source files to "check" an agent's work (the reviewer and verifier do that), and
never commit.

Arguments: `$ARGUMENTS`

**Keep your own context small** — it is the most expensive context in the run:
- Pass **paths** to agents, never file contents. Do not read the plan in full: grep its header,
  step headings and Execution / Verification matrix sections only.
- From each agent report keep only its status table and the lines the next decision needs; do
  not paste whole reports back to the user.
- Recommend running this skill in a chat on a Sonnet model (`/model sonnet`); orchestration is
  mechanical. Say it once, at intake, if the session is on Opus.

## State

`.claude/handoff/<slug>/implement-state.json` (git-ignored; `<slug>` = plan file name without the
date prefix and `.md`). Write it after every phase change with `jq` or the Write tool:

```json
{
  "slug": "blast-radius", "plan": "specs/plans/2026-10-13-blast-radius.md",
  "spec": "specs/L04-blast-radius.md", "base": "d4d6a52", "mode": "multi",
  "hints": "…", "designs": ["…png"],
  "phase": "build | review | fix | final-gates | verify | done | stopped",
  "ranges": [{"steps": "S1–S4", "status": "done"}],
  "round": 0, "next_id": 1,
  "findings": [{"id": "F-1", "severity": "critical|important", "rule": "B1", "where": "file:line",
                "what": "…", "fix": "…", "status": "open|fix|fixed|not-resolved|rejected|deferred|wont-fix",
                "reason": "…", "round": 1}],
  "verifier": {"verdict": "all met | gaps | blocked", "gaps": []},
  "updated": "<ISO time>"
}
```

## Phase 0 — Intake

1. Parse the arguments: one plan path (`specs/plans/*.md`), an optional quoted hint text, any
   number of `--design <image path>`, or `--resume <slug>`.
   - `--resume`: read the state file and continue at its `phase`. Missing file → say so and stop.
   - No plan path → stop: "Run spec-writer, approve the spec, run implementation-planner and save
     the plan first, then `/implement specs/plans/<file>.md`."
2. Check the plan: the file exists; its **Spec** line points at a spec whose `Status:` is
   `approved` (or a legacy spec with no Status line); its base commit is an ancestor of `HEAD`
   (`git merge-base --is-ancestor`). Any failure → tell the user and stop.
3. Read the **Execution mode** line. Missing → ask the user (`single` / `multi`).
4. **Hints and designs are guidance, not new scope.** Designs go to the implementer for UI steps.
   If a hint asks for behaviour the spec's ACs do not cover, ask the user: treat it as an
   implementation hint only / stop and revise the spec with spec-writer.
5. Branch: if on `main`, ask to create `feat/<slug>`. Uncommitted changes in files the plan
   touches → ask before starting.
6. Write the state file (`phase: build`).

## Phase 1 — Build

- **single:** one `implementer` agent: `plan: <path>`, `slug: <slug>`, all steps, hints, design
  paths, "do not commit".
- **multi:** the step ranges from the plan's Execution section, one `implementer` agent per range,
  **in order** (each starts with a fresh context; the evidence log is the handoff), same inputs
  plus `steps: S<a>–S<b>`.

After each run, record the range status. `partial` or `blocked` → show the blocked items and ask:
retry the range / continue with the next range / stop. Do not fix anything yourself.

## Phase 2 — Architecture review

Start `architecture-reviewer` with `base: <plan base>` and `next id: F-<next_id>`. Store each
finding (Critical and Important only — the agent drops everything below 80 confidence).
- `clean` → Phase 4.
- Findings → Phase 3, round 1.

## Phase 3 — Fix loop (max 3 rounds)

For each round `r`:

1. **Triage.** Show a compact table of the open findings: `ID · severity · rule · file:line · what
   · suggested fix`. Ask one question with these options:
   - **Fix all open findings (Recommended)**
   - **Choose per finding** — the user answers in "Other", e.g. `fix F-1 F-3; reject F-2: <reason>; defer F-4`
   - **Defer all** — keep them for the PR description, go to Phase 4
   - **Stop here** — save state, `phase: stopped`
   Rejected and deferred findings keep their reason and are never raised again: pass their IDs to
   the reviewer as "known, do not re-report".
2. **Fix.** One `implementer` agent: `mode: fix`, plan path, slug, round `r`, and the chosen
   findings as `F-<n> · file:line · rule · what · fix`. Record each finding's result
   (`fixed` / `wont-fix` with reason / `blocked`). Show `wont-fix` and `blocked` items to the user
   at the next triage.
3. **Re-check.** One `architecture-reviewer` agent: `mode: recheck`, the findings marked fixed,
   the "Files changed this round" list from the Fix Report, the known IDs, and
   `next id: F-<next_id>`. `not resolved` findings and new findings become open again.
4. No open findings → Phase 4. Open findings and `r < 3` → next round.
   After round 3 with findings still open → ask: one more round / defer the rest to the PR
   description / stop.

## Phase 4 — Final gates

If any fix round ran, the earlier `final` evidence lines no longer match the tree. Run the plan's
Verification matrix yourself, one gate per command:

```sh
scripts/gate.sh <slug> final -- "<matrix command>"
```

Each gate prints 1–3 lines. A failing gate → show the failure lines and ask: send to the
implementer as a fix finding (`F-<next_id>`, rule `gate`) / stop. Without fix rounds, skip this
phase: the implementer's own `final` lines still match.

## Phase 5 — Plan verification

Start `plan-verifier` with the plan path, the slug and the base. It trusts the fingerprinted
`final` lines and re-runs only the touched test files and typechecks.
- `all met` → Phase 6.
- `gaps` → show the gap rows and ask: fix them (implementer `mode: fix` with each gap as a
  finding `F-<n>`, rule `plan`, then re-run Phase 4 and this phase once) / accept and list them
  in the PR description / stop.

## Phase 6 — Finish (stop before commit)

Report in this shape, then stop:

```markdown
## /implement: <feature> — done
Plan: <path> · Mode: <single|multi> · Base: <sha> · Fingerprint: <current>

| Phase | Result |
|---|---|
| Build | <ranges and status> |
| Architecture review | <N findings → fixed N · rejected N · deferred N · rounds R> |
| Final gates | <one line per gate> |
| Plan verification | <verdict> |

Deferred / rejected findings (for the PR description): <list or none>
Not run: <gates with reason or none>
```

Then ask what to do next: run `doc-writer` (docs + spec → `implemented`) / run `pr-self-review` /
commit and open a PR / nothing. Do each only after the user picks it.

## Rules

- Never commit, push or open a PR without the user's explicit OK at the end.
- Never edit a spec or plan. A requirement problem found on the way goes to the user, who sends
  it to spec-writer or implementation-planner.
- Agents are started one at a time except where this skill says otherwise; never start
  test-writer from here.
- A gate that did not run is "not run: <reason>", never passed.
