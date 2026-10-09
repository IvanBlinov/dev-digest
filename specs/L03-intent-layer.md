# Intent Layer (PR intent classifier, scope-aware review, Intent card)

Plan: [plans/2026-10-08-intent-layer.md](plans/2026-10-08-intent-layer.md)

## Goal
Before any review, a separate call to a cheap non-reasoning model works out what the PR is trying to do and stores it per PR as `{ summary, in_scope[], out_of_scope[], confidence, sources[], missing_context[] }`. The PR page shows an Intent card (with stale marker and "Re-detect intent"); every review agent receives the intent as an unverified hypothesis and tags findings `scope: in|out`. With the scope filter on, out-of-scope findings are dropped, except serious ones (CRITICAL, security WARNING), which are always kept.

## Scope
- In: classifier (reviewer-core prompt + confidence), `pr_intent` storage, `GET/POST /pulls/:id/intent`, GitHub issue/spec source fetching (same repo only), review prompt intent slot, scope partition (serious findings kept), Intent card, "Outside PR scope" badge, Settings default model, seed + e2e flow.
- Out: risk areas, Jira/Linear fetching, OpenRouter `require_parameters`, auto-classification kill-switch, auto re-classify on head change.

## Contracts
- `Intent`: `{summary, in_scope, out_of_scope, confidence, sources: IntentSource[], missing_context}` (`intent` field renamed to `summary`; SQL column `intent` kept).
- New `IntentConfidence`, `IntentSourceKind`, `IntentSourceStatus`, `IntentSource`, `IntentClassification`, `PrIntentResponse`.
- `PrIntentRecord` gains metadata + `stale`/`stale_reason`.
- `Finding.scope` (`in|out`, nullish); `PromptAssembly.intent` (nullish).
- `FEATURE_MODELS.review_intent` default `openrouter / openai/gpt-4.1-mini`.
- `GitHubClient.getFileContent(repo, path, ref)`.
- API: `GET /pulls/:id/intent`, `POST /pulls/:id/intent` (6/min).
- DB: `pr_intent` + 12 columns, `findings.scope`.

## Per-package work
- server: `modules/intent/*`, executor intent step, migration 0014, seed.
- reviewer-core: `src/intent/*`, prompt intent slot + `SCOPE_RULE`, `src/review/scope.ts`, `reviewPullRequest` scope filter.
- client: hooks, `IntentCard`, `FindingCard` badge, page wiring, i18n.
- e2e: `08-pr-intent.flow.json`.

## Acceptance criteria
- [ ] AC1 Classifier sees title, body, branch, commits, issues, docs, files with hunk headers only; no hunk body line.
- [ ] AC2 `POST/GET /pulls/:id/intent` classify with `review_intent` model and upsert `pr_intent` with metadata.
- [ ] AC3 Record is `stale` with a reason after head SHA, title/body or prompt version changes.
- [ ] AC4 Empty body gives `confidence: low`; title, file names and hunk headers still in the input.
- [ ] AC5 Issue/spec refs fetched and listed in `sources` with status; unreachable refs go to `missing_context`, confidence capped at medium.
- [ ] AC6 Reviewer prompt has `## PR intent (unverified hypothesis)` wrapped untrusted plus trusted scope rule; unchanged without intent; trace stores it.
- [ ] AC7 (amended 2026-10-08, [plan](plans/2026-10-08-intent-scope-hardening.md)) With the filter on, every out-of-scope CRITICAL / security WARNING of every agent is kept (tagged `out`); other out-of-scope findings are dropped; runs complete independently.
- [ ] AC8 Review with no stored intent classifies once; failure degrades; stale intent used but filter off. Amended 2026-10-08: the filter also needs a fetched (`ok`) issue/spec/plan source; a description alone leaves intent as prompt context only.
- [ ] AC9 Intent card states + "Outside PR scope" badge + e2e flow.
- [ ] AC10 Settings default for "PR Review · Intent" is `openrouter / openai/gpt-4.1-mini`.
- [ ] AC11 Logs carry sizes, refs, statuses only; never body, issue/doc text, hunk bodies, query strings or keys.

## Decisions (agreed 2026-10-08)
See the Decisions table in the plan (14 rows): field rename with kept SQL column; sources v1; prompt in reviewer-core; model `openrouter / openai/gpt-4.1-mini`; risk areas removed; protected from the filter: CRITICAL or security WARNING, all of them (amended 2026-10-08, replaces one-signal/two-phase; see [plan](plans/2026-10-08-intent-scope-hardening.md)); no `require_parameters`; no kill-switch; auto-classify when none stored; filter only for fresh intent with confidence != low and a fetched issue/spec/plan (amended 2026-10-08); staleness = head SHA or hash(prompt version + title + body); UI placement above tabs; names `specs/L03-intent-layer.md`.

## Links
- [server/INSIGHTS.md](../server/INSIGHTS.md), [reviewer-core/INSIGHTS.md](../reviewer-core/INSIGHTS.md), [docs/agent-prompts/README.md](../docs/agent-prompts/README.md)
