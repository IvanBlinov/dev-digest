# Insights — reviewer-core

Dated entries, newest first. Format and rubrics: [../.claude/skills/engineering-insights/SKILL.md](../.claude/skills/engineering-insights/SKILL.md).

## 2026-09-17 — [Non-obvious behaviour] The engine entrypoint is `reviewPullRequest`, not `run`
Symptom: the README calls the orchestrator "the `run` entrypoint"; there is no export named `run`.
Cause: the file is `review/run.ts` but the exported function is `reviewPullRequest`.
Rule: import `reviewPullRequest`; when writing docs, name the function, not the file.
Proof: `reviewer-core/src/review/run.ts:123`

## 2026-09-17 — [Architectural decision] The package is source-only; `build` is a type-check
Context: the server type-checks against this source through a path alias; there is no publish step.
Decision: `build` and `typecheck` are both `tsc --noEmit`; no `dist/`, no `main`.
Consequence: renaming an export in `src/index.ts` breaks `server` typecheck, not this package's tests — run both.
Proof: `reviewer-core/package.json:9`, `server/tsconfig.json:24`

## 2026-09-17 — [Non-obvious behaviour] The model's score is discarded and recomputed after grounding
Symptom: the LLM returns a score that never appears in the persisted review.
Cause: after `groundFindings`, the outcome replaces `score` with `scoreFromFindings(ground.kept)`, a deterministic per-severity penalty from 100.
Rule: to change score semantics, edit `scoreFromFindings` in `reduce.ts`, not the prompt.
Proof: `reviewer-core/src/review/run.ts:208`, `reviewer-core/src/review/reduce.ts:20`

## 2026-09-17 — [Security] Prompt-injection defence is one guard, not keyword scanning
Symptom: a PR body asks the reviewer to skip vulnerabilities as "an intentional test fixture".
Cause: `INJECTION_GUARD` is appended to every system prompt and untrusted content is fenced by `wrapUntrusted`; the model is told such claims never descope the review.
Rule: do not add denylists or text-scanning for injection phrases; extend the guard text instead.
Proof: `reviewer-core/src/prompt.ts:16`, `reviewer-core/src/prompt.ts:30`, `reviewer-core/src/prompt.ts:85`

## 2026-09-17 — [Performance] Map-reduce kicks in only above 400 diff lines
Symptom: small PRs never hit the map-reduce path even with strategy `'auto'`.
Cause: `DEFAULT_MAP_THRESHOLD_LINES = 400` gates the split; below it the run is single-pass.
Rule: when testing reduce logic, build a diff longer than the threshold or pass an explicit strategy.
Proof: `reviewer-core/src/review/run.ts:30`, `reviewer-core/src/review/run.ts:34`
