# Spec: PR Brief — one-call summary, risk areas and review focus on the PR Overview
Spec ID: SPEC-03
Status: approved
Supersedes: —

## Problem and user
A reviewer opens someone else's pull request "cold" on the PR detail page
(`/repos/:repoId/pulls/:number`, **Overview** tab). Intent (L03), Smart Diff (L03) and Blast radius
(L04) each answer part of "what does this PR do and where is it risky", but the reviewer has to read
three blocks plus the description and then guess which file and line to open first. Today there is no
place that says "these are the risks, start reading here", so the first minutes of every review are
spent on orientation instead of on the risky code.

## Goals / Non-goals
Goals:
- G-1 — The Overview tab shows a **PR Brief**: a short summary, **Risk areas** (each tied to a file
  in this PR or its blast radius) and **Review focus** (`file:line — reason`), produced by exactly
  one model call over pre-computed facts.
- G-2 — A Review focus item (and a risk) opens **Files changed** at that file and line.
- G-3 — The brief is cached per PR and tied to the head SHA: a reload shows it without a model call,
  a new commit marks it stale, and Refresh regenerates it.
- G-4 — The reviewer can see which inputs the brief was built from and which were missing, trimmed
  or degraded.

Non-goals:
- PR history / "Prior PRs touching these files" (the design's collapsed row). `history` is removed
  from `PrBrief`; a later spec may add it.
- Review findings as a model input. The brief does not read `reviews` / `findings`; the
  VerdictBanner (AC-40) only displays the latest review, it does not feed the prompt.
- An MCP tool for the brief (no `get_pr_brief`).
- Automatic generation: not on PR open, not after a review run, not when the brief turns stale.
- Running intent classification as part of brief generation (it would be a second model call).
- Reading diff hunk bodies, the full file contents, or the repo map into the brief prompt.
- Per-PR or per-repo document attachments (attachments stay per agent / per skill, as in SPEC-01).
- Seeding a `pr_brief` row for the demo PR #482.

## User stories
- US-1 — As a reviewer, I want a Generate brief button on the Overview tab when no brief exists, so
  that I can ask for one when I need it.
- US-2 — As a reviewer, I want to see a summary, Risk areas and Review focus next to the Intent and
  Blast radius blocks, so that I understand the PR and its risks in one place.
- US-3 — As a reviewer, I want each risk to name its title, severity and file, and to expand into an
  explanation, so that I know what is risky and where.
- US-4 — As a reviewer, I want to click a `file:line` in Review focus (or a risk's file) and land on
  that line in Files changed, so that I start reading at the right place.
- US-5 — As a reviewer, I want the brief to reappear instantly after a reload and to tell me when new
  commits made it stale, so that I neither pay twice nor trust an outdated brief.
- US-6 — As a reviewer, I want a refresh button that regenerates the brief, so that I can update it
  after the PR changed.
- US-7 — As a reviewer, I want the brief to say which inputs were missing or cut, so that I know how
  much to trust it.
- US-8 — As a workspace owner, I want the brief to use the model chosen for "Risk Brief" in Settings
  and to call it exactly once, so that cost is predictable and visible in the logs.

## Acceptance criteria (EARS)
Tags: **[P1]**, **[P2]**, **[P3]** map to the course acceptance items in the brief.

### Contract (`@devdigest/shared`, `contracts/brief.ts`, server copy first, client mirror byte-identical)
- AC-1 [P2] — The shared contract `PrBrief` shall contain `summary` (string), `risks` (array of
  `Risk`), `review_focus` (array of `ReviewFocusItem { file: string, line: int, reason: string }`),
  `head_sha`, `generated_at` (ISO string), `prompt_version`, `input_hash`, `provider`, `model`,
  `tokens_in`, `tokens_out`, `cost_usd` (nullable), `duration_ms`, `attempts`, `inputs` (array of
  provenance entries, AC-30) and `dropped { risks: int, review_focus: int }`; it shall no longer
  contain `intent`, `blast` or `history`.
- AC-2 [P1] — The shared contract `Risk` shall carry `refs: [{ file: string, start_line: int | null,
  end_line: int | null }]` (at least one entry) in place of `file_refs`, plus the existing `kind`,
  `title`, `explanation` and `severity` (`high | medium | low`).
- AC-3 [P2] — `GET` and `POST /pulls/:id/brief` shall respond with the shared contract
  `PrBriefResponse { brief: PrBrief | null, stale: boolean, stale_reason: 'head_moved' |
  'description_changed' | 'prompt_updated' | null }`.
- AC-4 [P2] — The server copy and the client copy of `contracts/brief.ts` shall be byte-identical
  (`diff` prints nothing).
- AC-5 [P2] — The model's structured output shall be validated against a shared Zod schema
  `BriefModelOutput { summary, risks, review_focus }` before any post-validation runs.

### Reading the cache
- AC-6 [P1] — WHEN `GET /pulls/:id/brief` is called, the server shall return the stored brief for that
  PR, or `{ brief: null, stale: false, stale_reason: null }` when none is stored, without calling any
  model.
- AC-7 [P2] — WHEN a stored brief is returned, the server shall set `stale: true` with the first
  matching reason in this order: `prompt_updated` (stored `prompt_version` differs from the current
  brief prompt version), `head_moved` (stored `head_sha` differs from `pull_requests.head_sha`),
  `description_changed` (stored `input_hash` differs from the hash of the current title and body).
- AC-8 — IF the PR does not exist in the caller's workspace, THEN `GET` and `POST /pulls/:id/brief`
  shall respond 404 with the standard error envelope.

### Generating
- AC-9 [P1] — WHEN `POST /pulls/:id/brief` is called for a PR with at least one changed file, the
  server shall generate a brief, replace the stored `pr_brief` row for that PR, and return it with
  `stale: false`.
- AC-10 [P2] — WHEN a brief is generated, the server shall make exactly one request to the LLM
  provider: no re-ask on invalid JSON and no transport-level retry on 429, 5xx or timeout; the stored
  brief shall record `attempts: 1`.
- AC-11 [P2] — The server shall take the provider and model from the workspace's `risk_brief`
  feature-model setting, falling back to the registry default.
- AC-12 [P2] — The `risk_brief` registry default shall be provider `openrouter`, model
  `openai/gpt-4.1-mini`, in both copies of `contracts/platform.ts` and in
  `client/src/lib/feature-models.ts`.
- AC-13 [P2] — The prompt shall contain no diff hunk body lines; per changed file it shall carry only
  the path, Smart Diff role, additions, deletions and up to 10 hunk headers (`@@ -a,b +c,d @@
  heading`, each cut to 160 characters).
- AC-14 [P2] — The prompt shall contain, when available: the stored intent (summary, in-scope,
  out-of-scope, confidence, stale flag), the blast-radius summary with changed symbols and callers
  (`file:line`), the per-file diff stats of AC-13, the PR title and description, the text of linked
  issues, and the attached spec documents (AC-17).
- AC-15 — WHEN no intent is stored for the PR, the server shall generate the brief without it and
  shall not run intent classification.
- AC-16 — WHEN the stored intent is stale, the server shall include it marked as stale and record its
  provenance status as `stale`.
- AC-17 — The attached spec documents shall be the union, without duplicates, of documents attached
  to every enabled agent of the workspace and to their effective skills whose document kind is
  `specs`, read from the repository clone, plus spec/plan documents linked from the PR title or body
  that the intent source resolver fetches.
- AC-18 — The linked issue and linked document texts shall be fetched at generation time through the
  intent source resolver with its existing limits (≤ 3 issues, ≤ 3 documents, 8 s per source,
  `MAX_ISSUE_CHARS` 4 000, `MAX_DOC_CHARS` 12 000); this fetch shall make no model call.
- AC-19 [P2] — The total input to the model (all messages) shall be at most **12 000 tokens**, counted
  with the server tokenizer (`container.tokenizer`, js-tiktoken), with these sub-caps: spec
  documents ≤ 4 000 tokens, linked issue text ≤ 2 000 tokens, PR description ≤ 1 500 tokens, changed
  files ≤ 300 entries, blast callers ≤ 50.
- AC-20 [P2] — WHEN the assembled input exceeds a sub-cap or the 12 000-token total, the server shall
  trim in this order until it fits: spec documents (whole documents, last first) → linked issue text →
  blast callers (lowest rank first) → hunk headers → changed-file list tail (smallest additions +
  deletions first); the intent and the blast summary line shall never be trimmed.
- AC-21 — The model's output shall be bounded by `max_tokens` 2 000.
- AC-22 [P1] — The PR title, PR body, issue text, document text, file paths, symbol names and hunk
  headings shall reach the model only inside `wrapUntrusted` blocks of a system prompt
  that carries `INJECTION_GUARD`.

### Post-validation (before storing)
- AC-23 [P1] — The server shall drop every risk ref and every Review focus item whose `file` is in
  neither the PR's changed files nor the blast-radius file set (changed-symbol files plus caller files);
  when blast radius is degraded, the allowed set shall be the PR's changed files only.
- AC-24 — The server shall drop a risk whose refs are all dropped.
- AC-25 [P2] — The server shall drop a Review focus item on a changed file whose `line` is outside every
  new-side hunk range of that file's stored patch (old-side range when the file has no new-side
  lines); for a file known only from the blast radius, the line shall equal one of that file's caller
  lines, otherwise the item is dropped.
- AC-26 — The server shall store the number of dropped risks and Review focus items in `dropped`.
- AC-27 — The server shall match paths exactly after trimming whitespace and one leading `./`.
- AC-28 — The server shall clamp the output: summary ≤ 800 characters, ≤ 6 risks, ≤ 8 Review focus
  items, risk title ≤ 120 characters, explanation and reason ≤ 400 characters each; duplicate focus
  items (same file and line) shall be kept once.
- AC-29 — The server shall store risks sorted by severity (high, medium, low), ties in model order, and
  Review focus items in model order.

### Provenance and observability
- AC-30 [P1] — The stored brief shall list one provenance entry per input — `intent`, `blast`,
  `files`, `pr_description`, `issue` (one per linked issue), `spec` (one per document) — with `ref`
  (sanitised, ≤ 200 characters) and `status` one of `ok`, `missing`, `stale`, `degraded`,
  `truncated`, `over_budget`, `unavailable`, plus the degradation reason for blast
  (`flag_off | index_failed | index_partial | repo_too_large | no_data`) and `shown`/`total` counts for
  `files`.
- AC-31 [P2] — WHEN a brief is generated, the server shall emit one `prompt.assembled` event with
  `promptKind: 'brief'` carrying section names and sizes only.
- AC-32 [P2] — WHEN a brief generation finishes, the server shall write one log line `brief: generated`
  (or `brief: failed`) with correlation ID, provider, model, tokens in/out, cost, duration,
  `attempts`, provenance statuses and dropped counts, and no PR, issue, document or model text.

### Failure, limits and concurrency
- AC-33 — IF the PR has no changed files, THEN `POST /pulls/:id/brief` shall respond 422
  `brief_no_files` without calling the model.
- AC-34 — WHILE a brief generation for a PR is running, a second `POST /pulls/:id/brief` for the same PR
  shall respond 409 `brief_in_progress` without calling the model.
- AC-35 — `POST /pulls/:id/brief` shall be rate-limited to 6 requests per minute (same value as the
  intent detect limit); above it the server shall respond 429.
- AC-36 — IF the model call fails, times out (60 s), or returns output that fails `BriefModelOutput`,
  THEN the server shall respond with the error envelope (502 for provider/validation failure, the
  `ConfigError` status for a missing key), store nothing, and keep the previously stored brief
  unchanged; the message shall contain no model output.

### Overview tab UI (client)
- AC-37 [P1] — WHILE no brief is stored for the PR, the Overview tab shall show a "PR Brief" section
  with a **Generate brief** button.
- AC-38 [P1] — WHEN a brief is shown, the Overview tab shall render, in this layout: the summary at the
  top of the PR Brief section; left column the Intent card with **Risk areas** under it; right column
  the Blast radius block; a full-width **Review focus — read these first** card with a count badge;
  the Description last.
- AC-39 [P1] — WHEN Intent or Blast radius is not available, the Overview tab shall still render the
  brief and show a "Missing: …" line naming each input whose provenance status is `missing`,
  `unavailable`, `degraded` or `stale`; inputs with status `truncated` or `over_budget` shall appear
  only in the "Built from" line (AC-54).
- AC-40 [P3] — WHERE the PR has at least one review, the Overview tab shall show the VerdictBanner
  (verdict, findings and blockers count, PR score) of the latest review above the PR Brief.
- AC-41 [P1] — Each Risk areas row shall show a severity icon, the title and its first ref as
  `file:start-end` (or `file` when no line).
- AC-42 [P3] — WHEN the user activates a risk row, it shall expand to show the explanation and all refs;
  the row shall expose `aria-expanded`.
- AC-43 [P1] — Each Review focus row shall show `file:line — reason` with the `file:line` as a link.
  WHERE the item's file is among the PR's changed files (as returned by `GET /pulls/:id` at render
  time), the link target shall be Files changed (AC-44); WHERE the file is only in the blast radius,
  the link target shall be the file on GitHub at the PR's head SHA,
  `https://github.com/<owner>/<repo>/blob/<head_sha>/<path>#L<line>`, opened in a new tab with
  `rel="noopener noreferrer"`. IF the repository's `owner/name` is not known, THEN a blast-only file
  shall render as plain text, not as a link.
- AC-44 [P1] — WHEN the user activates a Review focus link whose file is among the PR's changed
  files, the page shall navigate to `?tab=diff&file=<path>&line=<n>`.
- AC-45 [P3] — WHEN the user activates a risk ref whose file is among the PR's changed files, the page
  shall navigate to `?tab=diff&file=<path>` plus `&line=<start_line>` when the ref has a line; WHEN the
  ref's file is only in the blast radius, the ref shall open the file on GitHub at the PR's head SHA
  (with `#L<start_line>` when it has a line) in a new tab with `rel="noopener noreferrer"`, as in AC-43.
- AC-46 [P1] — WHEN the page loads with a stored brief, the brief shall render from `GET` with no
  `POST` request.
- AC-47 [P1] — WHEN the user activates the refresh (↻) button, the client shall call
  `POST /pulls/:id/brief` and replace the shown brief with the response.
- AC-48 [P3] — WHILE a `POST` is pending, the PR Brief section shall show skeletons for summary, Risk
  areas and Review focus, and the Generate and refresh buttons shall be disabled with `aria-busy`.
- AC-49 [P2] — WHILE the shown brief is stale, the section shall show a banner with the stale reason
  ("New commits since this brief was generated" for `head_moved`) and a Regenerate button.
- AC-50 — IF `POST` fails, THEN the section shall show an error message with Retry and keep showing the
  previously stored brief; 429 shall show "Too many brief generations — try again in N s", 409 shall
  show "Generation already in progress" and re-fetch `GET`, 422 `brief_no_files` shall show "This PR
  has no changed files" with Generate disabled.
- AC-51 — WHEN a brief has zero risks, the Risk areas list shall show `brief.noRisks`; WHEN it has zero
  Review focus items, the card shall show a "no review focus" message.
- AC-52 — WHEN `dropped` is non-zero, the section shall show "N items removed: file not in this PR or
  its blast radius".
- AC-53 — The card footer shall show cost, tokens in → out, model, and "generated <relative time> for
  <short head SHA>" from the stored brief.
- AC-54 — The section shall show a "Built from" line listing each provenance input and its status
  (e.g. "files 300 of 1 240", "blast degraded: repo_too_large").
- AC-55 [P3] — Every user-visible string of the PR Brief section shall come from
  `client/messages/en/brief.json`.
- AC-56 — Summary, risk text, reasons and paths shall render as plain text (no Markdown, no HTML).

### Files changed navigation (client)
- AC-57 [P1] — WHEN the Files changed tab opens with `file=<path>`, it shall open the role group and the
  file card that contain the file (even when collapsed by default), scroll the card into view, mark it
  with a highlight border, and move keyboard focus to it.
- AC-58 [P2] — WHEN `line=<n>` is also present and the file's patch renders that line, the tab shall
  scroll that line into view and highlight it.
- AC-59 [P3] — IF the Files changed tab opens with a `file` query param that is not among the PR's
  changed files (e.g. a hand-edited or outdated deep link), THEN the tab shall show "File not in this
  PR's diff" at the top of the tab. Brief links never lead here for blast-only files (AC-43, AC-45).
- AC-60 — IF the file has no patch or the line is not rendered, THEN the tab shall scroll to the file
  card and show "Line not shown in this diff".
- AC-61 — WHEN the user navigates back from Files changed, the browser shall return to the Overview tab.

## Edge cases
- EC-1 — No intent stored → AC-15, AC-39 ("Missing: intent").
- EC-2 — Intent stale → AC-16; the brief is not marked stale for that reason alone.
- EC-3 — Blast radius degraded (`flag_off`, `index_failed`, `index_partial`, `repo_too_large`,
  `no_data`) → allowed paths are PR files only (AC-23); provenance `degraded` with reason (AC-30).
- EC-4 — No attached spec documents, or repo not cloned → generation proceeds; provenance `missing` /
  `unavailable` (AC-30).
- EC-5 — No GitHub token or GitHub unreachable → linked issues `unavailable`; generation proceeds.
- EC-6 — Huge PR (more than 300 files or over 12 000 tokens) → AC-19, AC-20; "Built from" shows the
  partial count (AC-54).
- EC-7 — PR with no files → AC-33, AC-50.
- EC-8 — Renamed file cited by its old path → the ref or item is dropped (AC-23), counted (AC-26).
  `pr_files` stores only the new path.
- EC-9 — Deleted file → line checked against the old-side range (AC-25); navigation per AC-57/AC-60.
- EC-10 — Binary or oversized file with `patch: null` → focus items with a line on that file are dropped
  (AC-25, no hunk range to match); risk refs to it are kept at file level; navigation per AC-60.
- EC-11 — Model returns zero risks or zero focus items, or all are dropped → AC-51, AC-52.
- EC-12 — Model cites a line outside the diff → AC-25.
- EC-13 — Model invents a path → AC-23.
- EC-14 — Invalid JSON, timeout, provider 429/5xx → no retry (AC-10), error per AC-36/AC-50, old brief kept.
- EC-15 — Two tabs click Generate at once → AC-34, AC-50.
- EC-16 — Rate limit hit → AC-35, AC-50.
- EC-17 — `risk_brief` provider key missing → `ConfigError` per AC-36; message links to Settings → Models.
- EC-18 — `pull_requests.head_sha` lags the refreshed `pr_files` (`GET /pulls/:id` refreshes files but
  not the head SHA) → the brief stores the stored head SHA and validates against the `pr_files` rows
  read in the same request; staleness follows the stored head SHA only (AC-7).
- EC-19 — A stored brief cites a file that left the PR after a new commit → the brief is stale (AC-49);
  the file is no longer among the changed files at render time, so its link opens the file on GitHub
  at the current head SHA (AC-43, AC-45); a deep link already copied to it shows "File not in this
  PR's diff" (AC-59).
- EC-20 — Direct link or reload on `?tab=diff&file=…&line=…` → same behaviour as AC-57–AC-60.
- EC-24 — Review focus item or risk ref on a file that is only in the blast radius (a caller file) →
  opens on GitHub at the PR head SHA in a new tab (AC-43, AC-45), never the "File not in this PR's
  diff" notice; without a known `owner/name` it is plain text.
- EC-21 — Very long paths and titles → truncated in the middle with the full value on hover and focus.
- EC-22 — Prompt-injection text in the PR body, an issue or a spec → fenced (AC-22); output paths still
  pass AC-23; output rendered as plain text (AC-56).
- EC-23 — PR deleted while generating → the `pr_brief` row is removed by the existing cascade; `POST`
  returns 404.

## Non-functional requirements
- NFR-1 — Cost and calls: exactly 1 LLM HTTP request per successful or failed generation; 0 on `GET`,
  on 409, on 422 and on 429. Checked with `MockLLMProvider.calls.length` in server tests.
- NFR-2 — Input budget: ≤ 12 000 tokens (js-tiktoken via `container.tokenizer`), sub-caps per AC-19;
  output ≤ 2 000 tokens (AC-21). Values live in brief module constants.
- NFR-3 — Latency: `GET /pulls/:id/brief` answers in ≤ 300 ms p95 on the seeded repo; `POST` times the
  model out at 60 s and each GitHub source at 8 s.
- NFR-4 — Rate limit: `POST` 6/min per client (AC-35), under the global 120/min.
- NFR-5 — Security: no PR, issue, document or model text in logs (AC-32); untrusted text fenced (AC-22);
  plain-text rendering (AC-56); error messages carry no model output (AC-36).
- NFR-6 — Accessibility: Generate, refresh, risk rows and focus links reachable by keyboard; focus links
  named "Open <file> line <n> in Files changed"; risk rows expose `aria-expanded`; pending buttons
  expose `aria-busy`.
- NFR-7 — i18n: all strings in `client/messages/en/brief.json` (new keys: section label, generate,
  refresh, generating, summary, Risk areas — renaming `block.risks` — Review focus with count, stale
  banner, missing inputs, built-from, dropped items, no files, errors, file not in diff, line not shown);
  `unavailableHint` text replaced.
- NFR-8 — Contracts: both `vendor/shared` copies identical for every touched file; `typecheck` green in
  `server`, `client`, `reviewer-core`; `client` `pnpm build` green.
- NFR-9 — Prompt assembly lives in `reviewer-core` (new exports only; no existing export renamed).

## Inputs and provenance
| Input | Source (table / route / adapter / model / user) | Freshness / owner |
|---|---|---|
| Intent | `pr_intent` row (read only; never classified here) | As of last intent detection; stale flag from intent rules · server `intent` module |
| Blast radius summary, changed symbols, callers | repo-intel index via the blast service (`GET /pulls/:id/blast` logic) | Index built at clone/resync time; computed per request · server `blast` / `repo-intel` |
| Changed files, diff stats, hunk headers | `pr_files` (path, additions, deletions, patch headers only) | Refreshed on `GET /pulls/:id` from GitHub · server `pulls` |
| Smart Diff role per file | Smart Diff role rules over `pr_files` | Per request, deterministic · server `smart-diff` |
| PR title, description, head SHA | `pull_requests` | Head SHA updated by PR list sync / polling · server `pulls` |
| Linked issues and linked spec/plan docs | GitHub via the intent source resolver | Fetched at generation time · server `intent` resolver + GitHub adapter |
| Attached spec documents | Agent/skill attachments (`context` tables) read from the repo clone | Clone state at generation time · server `project-context` |
| Model choice | Workspace setting `feature_models.risk_brief`, else registry default | Per request · server `settings` |
| Summary, risks, review focus | LLM (`risk_brief` model), validated by `BriefModelOutput`, post-validated | Stored in `pr_brief.json` with head SHA · server `brief` module |
| Latest review (VerdictBanner) | `GET /pulls/:id/reviews` | Per page load · client only, not a model input |
| Brief prompt version | `reviewer-core` brief prompt constant | Changes mark briefs stale (`prompt_updated`) |

## Untrusted inputs
| Input | Who controls it | Required handling |
|---|---|---|
| PR title, description | PR author | Fenced with `wrapUntrusted` under `INJECTION_GUARD`; description ≤ 1 500 tokens; hashed for staleness, never logged |
| Linked issue text | Issue author | Fenced; ≤ `MAX_ISSUE_CHARS` and ≤ 2 000 tokens; never logged |
| Spec / plan document text | Repo contributors | Fenced and hardened like project-context docs; ≤ 4 000 tokens total; never logged |
| File paths, symbol names, hunk headings | PR author / repo | Fenced; headings cut to 160 characters; refs in provenance ≤ 200 characters |
| Model output (summary, risks, focus items, paths, lines) | LLM | Zod-validated (AC-5), paths checked (AC-23), lines checked (AC-25), clamped (AC-28), rendered as plain text (AC-56); never echoed in error messages; a path used in a GitHub link (AC-43) is a validated blast-radius path, percent-encoded per path segment |
| `file` / `line` query params on Files changed | Anyone with a link | Matched against the PR's file list; non-matching → AC-59; `line` must be a positive integer, else ignored |

## Designs
Described from the screenshots in the homework brief (treated as data):
1. **Overview tab, PR #482 "Add rate limiting to public API endpoints"** (acme/payments-api). Section
   label "PR BRIEF". Top card: VerdictBanner — red "Request changes", chip "6 findings · 2 blockers",
   info icon, summary paragraph, a refresh (↻) icon button at the card's top right, circular "61 PR
   SCORE" gauge, footer "$ $0.014 8.2K→1.3K". Below, two columns:
   - Left card "INTENT": quoted intent sentence; IN SCOPE (✓ green list) / OUT OF SCOPE (× grey list);
     divider; "RISK AREAS" (warning icon): three compact bordered rows, each with a severity-coloured
     icon (shield red, package orange, bolt grey), bold title ("Auth surface touched", "New dependency:
     ioredis", "Adds Redis round-trip per request"), a blue mono file ref with line range
     (`src/middleware/ratelimit.ts:12-18`, `package.json:34`, `src/middleware/ratelimit.ts:40-52`), and
     a chevron to expand.
   - Right card "BLAST RADIUS": counts (2 symbols · 14 callers · 3 endpoints · 1 cron), Tree/Graph
     toggle, rateLimit() expanded with caller file:line rows, endpoint chips, cron chip, bucketKey()
     collapsed, and a collapsed "Prior PRs touching these files 3" row (out of scope here).
   - Full-width card "REVIEW FOCUS — READ THESE FIRST" with a count badge "4": bullet rows
     `file:line — reason`; file refs are blue links.
2. **Files changed tab after clicking a Review focus item**: "REVIEWER-ORDERED DIFF", 9 files +247 −38,
   Smart order / Original order toggle, role groups (Core logic, Wiring, Boilerplate). The target file
   card is scrolled into view with a blue highlight border; its finding is shown expanded under the
   line.
3. Annotated versions of (1) with red boxes around the VerdictBanner (P3), the Risk areas list and the
   Review focus list (P1).

Mapping: design 1 → AC-37–AC-56 (the VerdictBanner's refresh icon is the brief refresh, AC-47; the cost
footer is AC-53); design 2 → AC-57–AC-61; design 3 → tags on AC-40, AC-41, AC-43.

## Decision log
| Date | Decision | Source | Where |
|---|---|---|---|
| 2026-10-19 | "Exactly one call" = one HTTP request: no JSON re-ask, no transport retry; failure is visible | User, Q1 | AC-10, AC-36, NFR-1 |
| 2026-10-19 | `PrBrief` reshaped: summary, risks, review_focus, generation metadata, provenance, dropped counts; no intent/blast/history | User, Q2 | AC-1, Non-goals |
| 2026-10-19 | Risk refs become `{file, start_line, end_line}` | User, Q3 | AC-2, AC-41, AC-45 |
| 2026-10-19 | Specs input = attached `specs`-kind docs of enabled agents/skills + linked spec/plan docs | User, Q4 | AC-17 |
| 2026-10-19 | Linked issue text re-fetched via intent source resolver | User, Q5 | AC-18, EC-5 |
| 2026-10-19 | Intent used as stored, never classified by the brief | User, Q6 | AC-15, AC-16 |
| 2026-10-19 | Budget 12 000 tokens (js-tiktoken), sub-caps and trim order | User, Q7 | AC-19, AC-20, NFR-2 |
| 2026-10-19 | Hunk headers allowed, bodies never | User, Q8 | AC-13 |
| 2026-10-19 | Focus lines validated against hunk ranges / caller lines; invalid items dropped | User, Q9 | AC-25 |
| 2026-10-19 | Stale banner + Regenerate; no auto-regeneration | User, Q10 | AC-7, AC-49 |
| 2026-10-19 | Concurrent generation → 409 `brief_in_progress` | User, Q11 | AC-34 |
| 2026-10-19 | Layout follows the design | User, Q12 | AC-38 |
| 2026-10-19 | All six P3 items in scope | User, Q13 | AC-40, AC-42, AC-45, AC-48, AC-55, AC-59 |
| 2026-10-19 | `risk_brief` default → `openrouter` / `openai/gpt-4.1-mini` | User, Q14 | AC-12 |
| 2026-10-19 | Review findings not a model input | User, Q15 | Non-goals |
| 2026-10-19 | e2e: one flow on seeded PR #482 (Generate visible, deep link to file); no seeded brief | User, Q16 | Non-goals, AC-37, AC-57 |
| 2026-10-19 | Proposals P1–P21 accepted | User | AC-26–AC-35, AC-50–AC-54, AC-57–AC-61, EC-8–EC-21, NFR-5–NFR-7 |
| 2026-10-19 | R14: commit subjects removed from the untrusted prompt inputs (commits are not a brief input) | User, planner review | AC-22, Untrusted inputs |
| 2026-10-19 | R15: "Missing: …" lists only `missing`, `unavailable`, `degraded`, `stale`; `truncated` / `over_budget` only in "Built from" | User, planner review | AC-39 |
| 2026-10-19 | R16: a brief file that is only in the blast radius links to GitHub at the PR head SHA (new tab, `rel="noopener noreferrer"`); "File not in this PR's diff" stays for deep links to files outside the diff | User, planner review | AC-43, AC-44, AC-45, AC-59, EC-19, EC-24 |
| 2026-10-19 | The 429 response body carries `details.retry_after_s`; the client's "try again in N s" uses it | Planner implementation choice | AC-35, AC-50 |
| 2026-10-19 | The concurrent-generation guard (409 `brief_in_progress`) is per PR inside the API process; assumes one API instance (as the boot reaper does) | Planner implementation choice | AC-34 |

## Open questions
None.
