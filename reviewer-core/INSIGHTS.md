# Insights — reviewer-core

Dated entries, newest first. Format and rubrics: [../.claude/skills/engineering-insights/SKILL.md](../.claude/skills/engineering-insights/SKILL.md).

## 2026-10-08 — [Architectural decision] The prompt meter is injected, so the core stays crypto- and env-free
Context: logging a prompt manifest needs token counts and digests, but the core is pure (no `node:crypto`, no env, no tokenizer dependency).
Decision: `assemblePrompt(parts, meter?)` and `buildIntentMessages(input, meter?)` take an injected `SectionMeter {tokens?, digest?}`; the manifest (`PromptSection`) never stores section text and only constants authored here carry a `preview`. `reviewPullRequest` exposes `promptMeter` and `onPromptAssembled` (fired before each LLM call).
Consequence: the server decides token counting and whether digests exist (verbose flag); the CI runner can adopt the hook without new dependencies.
Proof: `reviewer-core/src/prompt.ts:137`, `reviewer-core/src/prompt-manifest.ts:39`

## 2026-10-08 — [Security] The author controls the intent, so the scope filter never drops serious findings
Context: intent text comes from the PR description; a filter that can hide findings lets an author descope a real defect. This supersedes the "always keeps one serious signal" entry below.
Decision: `partitionByScope` keeps EVERY out-of-scope CRITICAL / security WARNING (still tagged `out`, badge shown) and drops only the rest; scoring uses the kept set. No cross-agent pick, no `scopeCandidate`.
Consequence: a serious out-of-scope defect from any agent always reaches the review; only low-severity noise is filtered.
Proof: `reviewer-core/src/review/scope.ts:25`, `reviewer-core/src/review/run.ts:219`

## 2026-10-08 — [Security] (superseded by the entry above) The scope filter is a deterministic partition that always keeps one serious out-of-scope signal
Context: "ignore everything outside the PR's stated scope" is a way for an author to hide a real defect (the intent text is author-controlled).
Decision: scope is only a tag from the model; `partitionByScope` drops out-of-scope findings but keeps the single best CRITICAL / security-WARNING one as `scopeCandidate`, `pickScopeSignal` chooses one across agents with a total order (so completion order never matters), the filter is off for stale or low-confidence intents, and severity is never changed by scope. CI callers use `withScopeSignal` so a single run also yields at most one signal.
Consequence: a real security defect outside the PR's intent surfaces at most once per execution instead of vanishing; non-security out-of-scope findings are dropped and only logged.
Proof: `reviewer-core/src/review/scope.ts:54`, `reviewer-core/src/review/scope.ts:71`

## 2026-09-30 — [Pitfall] `OpenRouterProvider` ignored the per-request `timeoutMs`
Symptom: a review / conventions call against a slow model hung for 5–12 minutes although callers passed `timeoutMs`.
Cause: the timeout was only set on the OpenAI client (90 s default) and the SDK retries; `req.timeoutMs` never reached `chat.completions.create`.
Rule: per-request options go in the second argument of `create(...)`; covered by `test/openrouter-timeout.test.ts`.
Proof: `reviewer-core/src/llm/openrouter.ts:87`

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
