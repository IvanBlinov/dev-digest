# L03d — Safe structured logging of prompt assembly

## Goal
Each prompt build (one per review agent run, one per map-reduce chunk, one per intent classification)
emits a single structured pino event `prompt.assembled` with section names, sources, trust, chars,
tokens, model and a correlation ID. It never carries section contents, diff text, PR/spec/issue text
or secrets. The run's Live Log gets one short human line per build. A verbose mode adds safe detail
and works only outside production.

## Scope
- In: reviewer-core section manifest (`PromptSection`, `SectionMeter`, `onPromptAssembled`); server
  config flag `PROMPT_LOG_VERBOSE`; redaction + event builder; `RunTrace.config.correlation_id`.
- Out: UI for the correlation id, CI runner logging, pino `redact` config, persisting the manifest.

## Acceptance criteria
- AC1: `assemblePrompt` and `buildIntentMessages` return a `sections` manifest
  `{name, source, trust, chars, tokens?, sha256?, preview?}` with no content field; `preview` only on
  constant sections authored by reviewer-core.
- AC2: `reviewPullRequest` calls `onPromptAssembled` once before the LLM call (single-pass) or once per
  chunk with `chunk {index,total,file}` (map-reduce).
- AC3: `PROMPT_LOG_VERBOSE=1` sets `config.promptLogVerbose` only when `NODE_ENV !== 'production'`;
  in production it is ignored and boot logs one warning.
- AC4: `redactLogValue` strips URL query/fragment/userinfo and masks secret-like tokens; the event
  builder applies it to every string; verbose off => no `sha256`/`preview`/per-file/skill detail.
- AC5: A review execution with 2 agents emits `prompt.assembled` (`review`) per agent plus one
  `intent` event, sharing one `correlationId`, also stored in the trace `config.correlation_id`.
- AC6: `POST /pulls/:id/intent` emits `prompt.assembled` (`intent`) with `req.id` as correlationId.
- AC7: No captured log line contains PR body, diff body, spec/issue text or URL query secrets.
- AC8: Existing suites stay green.

## Decisions
1. Core stays pure: token counting and sha256 are injected via `SectionMeter`.
2. Server never re-splits prompt text; sections come from the core manifest.
3. The structured event goes to `ctx.logger` (pino) only; `runLog` (SSE) gets only a short summary line.
4. Previews only for `system:guard`, `system:scope-rule`, `system:intent` (constants). `task` in the
   review prompt embeds the PR title, so it is untrusted and never previewed.
5. Verbose flag is parsed only in `platform/config.ts`; only `'1'` enables; ignored in production.
6. `RunTrace.config.correlation_id` is `nullish` (old rows lack it).
7. `intent: classifying` log keeps `components` and gains `correlationId`.
8. No migration, no new dependency.

## Event shape
`{correlationId, runId?, prId, agent?, provider, model, promptKind: 'review'|'intent', promptVersion?,
mode?, chunk?{index,total}, sections[{name,source,trust,chars,tokens,sha256?,preview?}],
totals{sections,chars,tokens}, diffStats{files,additions,deletions,hunks}, diffFiles?[], skills?[]}`

## Section catalogue
Review: `system:agent` (trusted), `system:guard` (trusted, preview), `system:scope-rule` (trusted,
preview, only with intent), `task` (untrusted), `pr-description`, `pr-intent`, `skill:<i>`, `memory`
(trusted), `repo-map`, `spec:<i>`, `callers`, `diff`.
Intent: `system:intent` (trusted, preview), `task` (trusted, constant), `pr-title`, `pr-description`,
`branch`, `commits`, `issue:#N`, `doc:<path>`, `changed-files` (source `diff-headers`),
`unavailable-sources`.

## Safety list
No section text, diff, PR/spec/issue text, secrets, URL query/fragment/userinfo in any log line or SSE
event; redaction is defense in depth; verbose never in production.
