# Spec: Onboarding Generator — a five-part tour of a repository
Spec ID: SPEC-02
Status: approved
Supersedes: —

Related: `specs/L05-project-context.md` (SPEC-01, same lesson). This spec does not change any
SPEC-01 requirement.

## Problem and user
A developer joins a project, or must review PRs in a repository they have never read, and opens
it in DevDigest. The repo is cloned and indexed (`repo-intel`: symbols, import graph, file rank,
endpoints), but the studio offers no entry point: there is no Onboarding Tour screen, the sidebar
has no item for it, and `/onboarding` is the Add-repository form. The developer reads the code
cold: guesses the entry point, hunts for the run commands in `package.json` and compose files, and
reads files in the wrong order. A first day costs hours, and any tour written by hand goes stale
when the code moves.

## Goals / Non-goals
Goals:
- On `/repos/:repoId/onboarding` the user can generate and read a tour with five sections in this
  order: Architecture overview, Critical paths, How to run locally, Guided reading path, First
  tasks.
- Facts (stack, structure, routes, scripts, file rank, import graph) are collected
  deterministically; **exactly one** narrative LLM request turns them into prose; the call count
  and cost are visible in the server log, the API response and the page.
- The Guided reading path is ordered by file rank in the import graph, never by the model.
- When the index is degraded, the repo has no import graph, or the LLM call fails, the user sees a
  deterministic skeleton with an honest status and reason — never a blank page or invented text.
- The tour is stored per repo, marked stale when the index or prompt moves, and regenerated only on
  an explicit user action.

Non-goals:
- A tour for a repository without a clone built from the GitHub API (README / manifest via
  `getFileContent`). Covered by a later spec; v1 shows an empty state (AC-50).
- Using `hotness` (git churn) in the reading-path order. Rank today is PageRank only because the
  clone is shallow (`server/src/db/schema/repo-intel.ts:95`); the order follows `file_rank.rank`
  whatever formula produces it.
- Commands for non-Node ecosystems (Python, Go, Rust, …) beyond `docker-compose`, `.env.example`
  and `Makefile` targets.
- Changing the indexer: its 5000-file cap, its walk order or its JS/TS-only parsing.
- Automatic generation on page open or after each index refresh.
- Public sharing or hosting of a tour; Share link copies a link to this local studio only.
- Writing `ONBOARDING.md` into the repo folder (the `sync_to_folder` setting is not used here).
- An in-app file viewer; **Open** goes to GitHub.
- A new MCP tool (for example `get_onboarding`) or changes to existing MCP tool output.
- Adding SPEC-01 project-context document paths to the facts (deferred).
- Feeding the tour into review prompts.
- Narrative in languages other than English.
- A file explorer or symbol search on the tour page.

## User stories
- US-1 — As a developer new to a repo, I want a generated tour with architecture, critical paths,
  run commands, a reading order and first tasks, so that I can be productive on day one.
- US-2 — As a developer, I want the reading path ordered by importance in the import graph, so that
  I read foundational files first.
- US-3 — As a developer, I want run commands that really exist in the repo and that I can copy, so
  that I do not paste invented commands into my terminal.
- US-4 — As a developer, I want to see honestly which parts are model-written, which are
  deterministic and which are unavailable (and why), so that I know how far to trust the page.
- US-5 — As a developer, I want to see when the tour was generated and whether the code moved since,
  and to regenerate it, so that I do not follow an outdated tour.
- US-6 — As a course student or operator, I want to see how many LLM calls a generation made and
  what it cost, in the logs and on the page, so that I can verify and control the cost.
- US-7 — As a developer, I want to share the tour or export it as Markdown, so that a teammate can
  read the same tour.

## Acceptance criteria (EARS)

### Generation lifecycle (server)
- AC-1 — WHEN `POST /repos/:id/onboarding/generate` is received for a cloned repo with no
  generation running, the server shall answer 202 with `{ status: "generating" }` and run one
  generation in the background.
- AC-2 — `GET /repos/:id/onboarding` shall return an `OnboardingTourState` with:
  `status` (`none | generating | ready | partial | skeleton | failed`), `cloned` (boolean),
  `tour` (the stored `OnboardingTour` or null), `stale` (boolean), `stale_reason`
  (`index_moved | prompt_changed`, nullable), `index_updated_at` (nullable) and `last_error`
  (`{ reason, at }`, nullable).
- AC-3 — WHILE no tour is stored for the repo and no generation is running, `GET` shall return
  `status: "none"` and `tour: null`.
- AC-4 — IF `POST …/onboarding/generate` arrives while a generation for the same repo is running,
  THEN the server shall answer 409 `onboarding_generation_running` and start no second generation
  and no LLM request.
- AC-5 — IF the repo has no clone, THEN `POST …/onboarding/generate` shall answer 409
  `repo_not_cloned` without any LLM request, and `GET` shall return `cloned: false`.
- AC-6 — IF `POST …/onboarding/generate` is called more than 6 times per minute
  (`ONBOARDING_GENERATE_RATE_LIMIT`), THEN the server shall answer 429.
- AC-7 — IF a generation has been running for more than 10 minutes
  (`ONBOARDING_STALE_GENERATION_MS`), THEN `GET` shall report it as `failed` with reason
  `interrupted`, and a new `POST` shall be accepted.
- AC-8 — WHEN a generation finishes (with or without narrative), the server shall store the result
  as the repo's only tour, readable after a server restart, except as stated in AC-9.
- AC-9 — IF a generation fails (AC-17, AC-18, AC-7) while a stored tour with status `ready` or
  `partial` exists, THEN the server shall keep that tour unchanged and `GET` shall return
  `status: "failed"`, the kept `tour`, and `last_error: { reason, at }`.
- AC-10 — IF a generation fails while no `ready` or `partial` tour is stored, THEN the server shall
  store a deterministic tour with `status: "skeleton"` and the failure reason.
- AC-11 — Every stored tour shall record `index_sha` (nullable), `prompt_version`, `generated_at`,
  `coverage: { files_indexed, files_total (nullable), partial }`, `reasons` (reason codes, AC-41)
  and `generation` (AC-22).
- AC-12 — WHILE an index state exists for the repo and its `last_indexed_sha` differs from the
  tour's `index_sha`, `GET` shall return `stale: true, stale_reason: "index_moved"`. WHILE the
  tour's `prompt_version` differs from the current prompt version, it shall return `stale: true,
  stale_reason: "prompt_changed"`. With no index state, `stale` shall be false.
- AC-13 — WHEN a repo is deleted, the server shall delete its stored tour.

### The narrative LLM call (lab requirement)
- AC-14 — Each generation shall send **at most one** request to the LLM provider: no schema
  re-prompt and no transport retry.
- AC-15 — WHEN a generation runs for a cloned repo with an API key configured for the resolved
  provider, the server shall send exactly one LLM request and log `llm_calls=1` (AC-20).
- AC-16 — IF no API key is configured for the resolved provider, THEN the generation shall send no
  LLM request, store the deterministic content with reason `no_api_key`, and log `llm_calls=0`.
- AC-17 — The request shall use the `onboarding` Feature Models setting of the workspace; the
  registry default for `onboarding` shall be `openrouter / openai/gpt-4.1-mini`
  (`FEATURE_MODELS`, server copy canonical, client mirror identical).
- AC-18 — The request shall use timeout 60 s (`ONBOARDING_TIMEOUT_MS`), at most 3000 output tokens
  (`ONBOARDING_MAX_OUTPUT_TOKENS`) and temperature 0.2 (`ONBOARDING_TEMPERATURE`).
- AC-19 — IF the request times out, THEN the generation shall end with reason `llm_timeout`; IF the
  provider returns an error, THEN with reason `llm_error`; IF the output does not parse into the
  narrative contract, THEN with reason `invalid_output`. Each case follows AC-9 or AC-10.
- AC-20 — WHEN a generation ends, whatever its outcome, the server shall write one log line of the
  form `onboarding: done repo=<id> status=<status> llm_calls=<n> tokens_in=<n> tokens_out=<n>
  cost_usd=<n|null> duration_ms=<n> reasons=<codes>`. The line shall contain no repo text and no
  LLM text.
- AC-21 — WHEN the narrative prompt is built, the server shall emit one `prompt.assembled` event
  with `promptKind: "onboarding"` carrying section names, sources, trust, sizes and tokens only,
  never prompt text.
- AC-22 — Every stored tour shall carry `generation: { provider, model, llm_calls, tokens_in,
  tokens_out, cost_usd (nullable), duration_ms }`, with `cost_usd` taken from the provider
  adapter's reported cost.

### Facts and prompt input (server)
- AC-23 — The server shall read repo content for the facts only from this allowlist: the root
  `README*` (first 4000 characters, `ONBOARDING_README_CHARS`), `package.json` files, lockfile
  names, `docker-compose*.yml` / `compose*.yml`, `.env.example`, `Makefile`, and index data
  (paths, symbols, signatures, endpoints, crons, rank, edges, repo map). It shall never read any
  other `.env*` file, key or certificate file.
- AC-24 — From `.env.example` the server shall take variable **names** only (at most 20,
  `ONBOARDING_MAX_ENV_NAMES`), never values.
- AC-25 — The prompt shall carry every repo-derived fact inside an `<untrusted>` block behind the
  existing injection guard, with `<untrusted` and `</untrusted` look-alikes escaped.
- AC-26 — The prompt input shall not exceed 8000 tokens (`ONBOARDING_MAX_INPUT_TOKENS`, server
  tokenizer). IF the facts exceed it, THEN the server shall drop fact groups in this fixed order
  until it fits: (1) README excerpt, (2) repo map, (3) symbols of ranked files from the lowest rank
  up, (4) endpoints beyond the first 10. It shall never drop the stack, the command list, the
  reading-path paths or the critical-path paths. The tour shall then carry reason
  `budget_trimmed`, and the log line (AC-20) shall name the dropped groups.

### Architecture overview
- AC-27 — The Architecture overview shall show a narrative of at most 1500 characters
  (`ONBOARDING_MAX_NARRATIVE_CHARS`) from the LLM, or, when no narrative is available, a
  deterministic summary naming the stack, the top-level modules and the number of endpoints.
- AC-28 — The Architecture overview diagram shall be built deterministically: up to 8 top-level
  module nodes (`ONBOARDING_MAX_DIAGRAM_MODULES`) chosen by summed file rank, up to 4 external
  service nodes from compose service names (`ONBOARDING_MAX_DIAGRAM_SERVICES`), and an edge between
  two modules when any file of one imports a file of the other. The LLM shall not add nodes or
  edges.
- AC-29 — IF the import graph of the repo is empty, THEN the diagram shall be absent and the
  section shall show "Diagram unavailable" with reason `no_graph` or `index_degraded`.

### Critical paths
- AC-30 — The Critical paths section shall list at most 5 files (`ONBOARDING_MAX_CRITICAL_PATHS`)
  taken from files that declare endpoints or crons and files on the index's dependency chains,
  ordered by file rank descending, ties by path ascending, tests/configs/migrations excluded.
- AC-31 — Each critical-path row shall carry a deterministic fact (for example
  `3 endpoints · imported by 14 files`) and an optional LLM reason of at most 120 characters
  (`ONBOARDING_MAX_REASON_CHARS`). IF the LLM gives no valid reason for a path, THEN the row shall
  show the fact only.

### How to run locally
- AC-32 — The server shall derive the command list only from repo files:
  1. install with the package manager named by the lockfile (`pnpm-lock.yaml` → `pnpm install`,
     `yarn.lock` → `yarn install`, `package-lock.json` or none → `npm install`);
  2. `cp .env.example .env` when `.env.example` exists, with the variable names of AC-24 as its
     comment;
  3. `docker compose up -d <services>` when a compose file exists;
  4. `<pm> run <name>` for each of the `package.json` scripts `dev`, `start`, `build`, `test` that
     exists, in that order;
  5. `make <target>` for each `Makefile` target named `setup`, `install`, `dev`, `run`, `start` or
     `test`.

  The list shall hold at most 6 commands (`ONBOARDING_MAX_COMMANDS`), kept in this order.
- AC-33 — The LLM may reference commands only by their id, to set their order and a comment of at
  most 80 characters (`ONBOARDING_MAX_COMMAND_COMMENT_CHARS`). The server shall drop every command
  id the LLM returns that is not in the AC-32 list and append every listed command the LLM left out
  in AC-32 order. No command text from the LLM shall appear in the tour.
- AC-34 — IF no command can be derived, THEN the section shall show "No run commands found in
  package.json, compose files or Makefile".

### Guided reading path (lab requirement)
- AC-35 — The Guided reading path shall list at most 8 files (`ONBOARDING_MAX_READING_PATH`) in
  `file_rank.rank` descending order, ties by path ascending, with tests, configs, declaration files
  and migrations excluded.
- AC-36 — The LLM may supply one "why read this" line of at most 120 characters per listed path.
  The server shall ignore any LLM item whose path is not in the list and shall keep the AC-35 order
  whatever order the LLM returns. IF a path has no valid line, THEN the row shall show
  `Imported by N files` from the import graph.
- AC-37 — IF the import graph is empty (no JS/TS sources, or no edges), THEN the section shall show
  "Not available: the import graph covers JS/TS sources only" with reason `no_graph`, and shall
  list no files in any substitute order.

### First tasks
- AC-38 — The First tasks section shall show at most 3 tasks (`ONBOARDING_MAX_FIRST_TASKS`), each
  with a title of at most 120 characters, a description of at most 300 characters and at least one
  file path. The server shall drop every task that cites no path from the tour's known paths
  (AC-40) and remove cited paths that are not known.
- AC-39 — IF no valid task remains or no narrative is available, THEN the section shall show
  "First tasks are written by the narrative step — Regenerate to try again" and be marked
  deterministic.

### Validation, status and honesty
- AC-40 — Every tour shall carry `known_paths`: the set of repo paths present in its facts. A path
  in any LLM text shall be rendered as a link only when it is in `known_paths`; any other path or
  URL shall be rendered as plain text.
- AC-41 — Every tour section shall carry `source` (`llm | deterministic`) and, when it is
  incomplete, `unavailable_reason`. Reason codes are: `no_clone`, `index_degraded`,
  `index_partial`, `no_graph`, `llm_timeout`, `llm_error`, `invalid_output`, `no_api_key`,
  `budget_trimmed`, `interrupted`.
- AC-42 — The server shall set the tour status to `ready` when every section has its narrative part
  from the LLM and nothing is unavailable; `partial` when at least one section fell back to
  deterministic content or is unavailable; and `skeleton` when the generation produced no narrative.
- AC-43 — The server shall truncate every LLM text field that exceeds its cap at the cap and end it
  with `…`.

### Degraded index (lab requirement)
- AC-44 — WHILE the repo's index state is missing, `degraded` or `failed`, or `REPO_INTEL_ENABLED`
  is off, a generation shall still run on the clone facts (AC-23, AC-32). The reading path,
  critical paths and diagram shall be unavailable with reason `index_degraded`, and the tour status
  shall be `partial` (or `skeleton` if the LLM call also fails).
- AC-45 — WHILE the index state is `partial`, or the indexer dropped files above its cap, the tour
  shall have `coverage.partial: true` and reason `index_partial`.

### Tour page (client)
- AC-46 — The sidebar WORKSPACE section shall show an **Onboarding Tour** item after Pull Requests,
  linking to `/repos/:repoId/onboarding`, with the shortcut `g o`.
- AC-47 — `/onboarding` shall stay the Add-repository screen, and the Onboarding Tour item shall be
  marked active only on `/repos/:repoId/onboarding`.
- AC-48 — The page shall show the breadcrumb `<owner/name> › Onboarding Tour` and the title
  `Onboarding for <repo name>`.
- AC-49 — The page subtitle shall read `Generated from index of N files · generated <relative
  time> · index <relative time>` where N is `coverage.files_indexed`. WHERE `coverage.partial` is
  true, it shall read `N of M files (partial)` (M = `files_total`), or `N files (partial)` when M
  is null. "index" shall be omitted when `index_updated_at` is null.
- AC-50 — IF the repo is not cloned and no tour is stored, THEN the page shall show "Clone and index
  this repository to generate a tour", the index status from `GET /repos/:id/index-state` and a
  control that triggers `POST /repos/:id/resync`, and no Generate control.
- AC-51 — IF the repo is not cloned and a tour is stored, THEN the page shall show the tour with
  Regenerate disabled and the note "Clone the repository to regenerate".
- AC-52 — WHILE `status` is `none` and the repo is cloned, the page shall show a **Generate
  onboarding tour** control and the note "Makes one model call".
- AC-53 — WHILE `status` is `generating`, the page shall show five section placeholders and a
  "Generating…" label, disable Generate and Regenerate, and re-request `GET` every 2 s
  (`ONBOARDING_POLL_MS`) until the status changes.
- AC-54 — WHEN the user activates Generate or Regenerate, the client shall send
  `POST …/onboarding/generate` and show the `generating` state. IF it answers 409
  `onboarding_generation_running`, THEN the client shall show the `generating` state and poll.
  IF it answers 429, THEN the client shall show "Too many generations — try again in a minute".
- AC-55 — The page shall show a left "ON THIS PAGE" list of the five sections linking to the anchors
  `#architecture-overview`, `#critical-paths`, `#how-to-run-locally`, `#guided-reading-path`,
  `#first-tasks`, and mark the section in view as current. WHEN the page opens with one of these
  anchors, it shall scroll to that section.
- AC-56 — Each section shall be a card that the user can collapse and expand by mouse or keyboard,
  exposing `aria-expanded`. Collapse state shall not persist across page loads.
- AC-57 — WHERE `stale` is true, the page shall show a "Stale" badge with the text "Index moved
  since this tour" or "Tour format changed" for `index_moved` / `prompt_changed`, next to
  Regenerate.
- AC-58 — WHERE `status` is `failed` and a tour is shown, the page shall show a banner
  "Regeneration failed <relative time>: <reason label> — showing the tour from <relative time>".
- AC-59 — WHERE a section's `source` is `deterministic`, the card shall show a "Deterministic" chip.
  WHERE a section has `unavailable_reason`, the card shall show the unavailable message with the
  reason's label.
- AC-60 — Each critical-path row shall show the path, the fact, the reason when present, and an
  **Open** control that opens `https://github.com/<owner>/<name>/blob/<index_sha or default
  branch>/<path>` in a new tab with `rel="noopener noreferrer"`, named `Open <path>`.
- AC-61 — Each command row shall show its number, the command and its comment, and a copy control
  named `Copy <command>` that copies the command text without the comment. WHERE the command runs a
  `package.json` script, hover and keyboard focus shall show the script body as plain text,
  truncated to 200 characters.
- AC-62 — Each reading-path row shall show its number, the path and its "why read this" line.
- AC-63 — Each first-task row shall show the title, the description and its file paths, each path
  linked as in AC-60.
- AC-64 — WHEN the user activates **Share link**, the client shall copy the absolute URL of
  `/repos/:repoId/onboarding` to the clipboard and show "Link copied".
- AC-65 — WHEN the user activates **Copy as Markdown**, the client shall copy the whole tour as
  Markdown (five sections in order, paths in backticks, commands in a code block) and show
  "Markdown copied".
- AC-66 — The page header shall show a footnote `<model> · <llm_calls> call(s) · $<cost_usd>` from
  `generation`, with `cost unknown` when `cost_usd` is null.
- AC-67 — The page shall render narrative and LLM text as Markdown with raw HTML skipped
  (`skipHtml`), images not loaded and URLs not linked, and all other repo-derived text (paths,
  commands, script bodies, facts) as plain text.
- AC-68 — IF `GET /repos/:id/onboarding` fails, THEN the page shall show "Couldn't load the
  onboarding tour" with a Retry control.

### Contracts, seed and demonstration
- AC-69 — The tour contracts (`OnboardingTour`, `OnboardingTourState` and the generate response)
  shall be defined in `@devdigest/shared` (server copy canonical, client copy identical, wire
  format snake_case). The existing `Onboarding` schema shall stay unchanged.
- AC-70 — The seed shall store a tour with `status: "ready"` for `acme/payments-api`, and an e2e
  flow shall open its tour page and see all five section titles with no model call.
- AC-71 — WHEN a test generation runs with the mock LLM on a fixture repo with an import graph, the
  mock shall receive exactly one request, the log line shall show `llm_calls=1`, and the reading
  path shall equal the fixture's files in `file_rank.rank` descending order.
- AC-72 — (Demonstration) WHEN the user adds an unfamiliar open-source JS/TS repository, waits for
  the index, and generates its tour, the page shall show the five sections, and the server log
  shall show one `onboarding: done` line with `llm_calls=1` and a `cost_usd` value.

## Edge cases
- EC-1 — No repo exists → the page shows "Add a repository to see its onboarding tour" with a link
  to `/onboarding`.
- EC-2 — Repo not cloned, no tour (fresh import, clone running) → AC-50; POST → AC-5.
- EC-3 — Repo not cloned, tour stored (seeded `acme/payments-api`) → AC-51, AC-70.
- EC-4 — Index missing, degraded, failed or flag off → AC-44.
- EC-5 — Repo above the 5000-file index cap, or index `partial` → AC-45, AC-49 (`N of M files
  (partial)`).
- EC-6 — Non-JS/TS repo or no import edges → AC-29, AC-37; README and commands still shown.
- EC-7 — No API key → AC-16 (`llm_calls=0`, skeleton or kept tour).
- EC-8 — LLM timeout, provider error, invalid output → AC-19 with AC-9 / AC-10.
- EC-9 — LLM output partly valid (missing section, unknown paths, unknown command ids, over-long
  text) → AC-33, AC-36, AC-38, AC-40, AC-43; status `partial` (AC-42).
- EC-10 — Facts larger than the input budget → AC-26 (`budget_trimmed`).
- EC-11 — Two Generate clicks, or two tabs → AC-4; the client keeps polling (AC-54).
- EC-12 — Server restarts during a generation → AC-7 (`interrupted` after 10 min).
- EC-13 — Index moves after generation (resync) → AC-12, AC-57; no automatic regeneration.
- EC-14 — The user switches the active repo while a generation runs → the generation continues for
  its repo; the page shows the newly selected repo's state.
- EC-15 — Repo deleted → AC-13.
- EC-16 — Rate limit hit → AC-6, AC-54.
- EC-17 — No commands derivable → AC-34.
- EC-18 — No valid first task → AC-39.
- EC-19 — Very long paths, script bodies or names → truncated with an ellipsis; the full value
  shows on hover and keyboard focus (script bodies capped at 200 characters, AC-61).
- EC-20 — README or code contains injection text ("ignore previous instructions…") → AC-25; any
  effect on the output is still bounded by AC-33, AC-36, AC-38, AC-40 and AC-67.
- EC-21 — A `package.json` script body is dangerous (`rm -rf`, `curl … | sh`) → shown only as
  plain text on hover (AC-61); the copied command is `<pm> run <name>`; nothing is executed.
- EC-22 — `.env` with real secrets is present in the clone → never read (AC-23).
- EC-23 — Direct link with an anchor, refresh, back navigation → AC-55; data reloads from `GET`.
- EC-24 — `GET` fails → AC-68.
- EC-25 — Narrow screen (below the `md` breakpoint) → the "ON THIS PAGE" list is hidden; cards take
  the full width; command rows scroll horizontally.
- EC-26 — Stored tour produced by an older prompt version → AC-12 (`prompt_changed`).
- EC-27 — Clipboard write refused by the browser → the client shows "Couldn't copy to the
  clipboard".

## Non-functional requirements
- NFR-1 — Limits, each a named server constant (client mirrors only the ones it displays, with a
  test asserting equality):
  - `ONBOARDING_MAX_READING_PATH` 8, `ONBOARDING_MAX_CRITICAL_PATHS` 5, `ONBOARDING_MAX_COMMANDS`
    6, `ONBOARDING_MAX_FIRST_TASKS` 3;
  - `ONBOARDING_MAX_INPUT_TOKENS` 8000, `ONBOARDING_MAX_OUTPUT_TOKENS` 3000,
    `ONBOARDING_TIMEOUT_MS` 60 000, `ONBOARDING_TEMPERATURE` 0.2;
  - `ONBOARDING_README_CHARS` 4000, `ONBOARDING_MAX_ENV_NAMES` 20;
  - `ONBOARDING_MAX_NARRATIVE_CHARS` 1500, `ONBOARDING_MAX_REASON_CHARS` 120, task description 300,
    `ONBOARDING_MAX_COMMAND_COMMENT_CHARS` 80;
  - `ONBOARDING_MAX_DIAGRAM_MODULES` 8, `ONBOARDING_MAX_DIAGRAM_SERVICES` 4;
  - `ONBOARDING_GENERATE_RATE_LIMIT` 6/min, `ONBOARDING_STALE_GENERATION_MS` 600 000,
    `ONBOARDING_POLL_MS` 2000 (client).
- NFR-2 — Cost: at most one LLM request per generation (AC-14); no LLM request on page view, on
  `GET`, on index refresh or in e2e.
- NFR-3 — Performance: `GET /repos/:id/onboarding` answers in ≤ 300 ms p95 on the seeded DB.
  Fact collection (everything before the LLM request) completes in ≤ 10 s for an index of 5000
  files.
- NFR-4 — Observability: the `onboarding: done` line (AC-20) and `prompt.assembled` (AC-21) are
  the only generation logs; neither carries README, script, code or LLM text.
- NFR-5 — Security: repo-derived text enters the prompt only per AC-23–AC-26; LLM output reaches
  the screen only per AC-40, AC-43, AC-67; no command is ever executed by the server or the client.
- NFR-6 — Tests (derived from the ACs, all hermetic, no real model):
  - server unit tests with `MockLLMProvider` prove AC-14–AC-16, AC-19, AC-20, AC-26, AC-32–AC-45
    and AC-71 (one request, `llm_calls=1`, cost `0.001`, rank order, skeleton on failure and on a
    degraded index, path and command grounding, `.env` never read);
  - a DB-backed `*.it.test.ts` proves AC-1–AC-13 (202/409/429, stale, keep-previous, cascade);
  - client component tests cover AC-46–AC-68;
  - an e2e flow covers AC-70.
- NFR-7 — Accessibility: every control (Generate, Regenerate, Share link, Copy as Markdown, Open,
  copy, card toggle) has an accessible name; Open and copy names include the path or command; the
  page is fully operable by keyboard; script-body and full-path tooltips are reachable by focus.
- NFR-8 — i18n: every user-facing string lives in `client/messages/en/onboarding.json` (its current
  stale text describing other sections is replaced) or `shell.json` (nav, shortcut).
- NFR-9 — Contract drift: `diff` of the server and client copies of every touched `vendor/shared`
  file prints nothing; the client imports these contracts as types only.

## Inputs and provenance
| Input | Source (table / route / adapter / model / user) | Freshness / owner |
|---|---|---|
| Index state, files indexed, last indexed sha, updated at | `repo_index_state` via `GET /repos/:id/index-state` / repo-intel facade | Written by the indexer on clone and resync |
| Total discovered files (M) | Indexer walk statistics | Last index run; null when not recorded |
| File rank | `file_rank` via `getTopFilesByRank` | Last index run (PageRank; hotness 0) |
| Import graph | `file_edges` | Last index run |
| Dependency chains | `getCriticalPaths` | Last index run |
| Endpoints, crons | `file_facts` | Last index run |
| Symbols, signatures, repo map | `symbols`, `repo_map_cache` | Last index run |
| README excerpt, `package.json`, lockfile names, compose files, `.env.example` names, `Makefile` targets | Repo clone working tree (default branch) | Read at generation time |
| Repo owner, name, default branch, clone presence | `repos` | Per request |
| Model choice | Settings `feature_models.onboarding`, default `openrouter / openai/gpt-4.1-mini` | Read at generation time |
| Narrative, reasons, task text, command order and comments | One structured LLM call | Generation time; stored with the tour |
| Tokens and cost | LLM provider adapter (`costUsd`, price book) | Generation time; stored in `generation` |
| Stored tour, generation state | Server storage per repo | Until the next successful generation or repo deletion |
| Prompt version | Server constant | Process start |
| User actions (Generate, Regenerate, Share, Copy) | User | Per action |

## Untrusted inputs
| Input | Who controls it | Required handling |
|---|---|---|
| README text, `package.json` (names, scripts), compose files, `Makefile`, `.env.example` | Anyone with commit access to the repo | Allowlist only (AC-23); `.env.example` names only (AC-24); capped; fenced in `<untrusted>` blocks with the injection guard and look-alikes escaped (AC-25); never logged (AC-20); script bodies shown only as truncated plain text (AC-61). |
| File paths, symbol names, signatures, endpoint strings | Repo committers | Fenced as untrusted in the prompt; rendered as plain text; GitHub URLs built from the path with each segment URL-encoded (AC-60). |
| LLM output (narrative, reasons, task text, command ids and comments) | Model, steerable by repo content | Validated by a Zod contract; capped (AC-43); paths linked only when in `known_paths` (AC-40); command text never taken from the LLM (AC-33); reading-path order never taken from the LLM (AC-36); rendered with `skipHtml`, no images, no URL links (AC-67). |
| `#anchor` in the URL | Anyone who sends a link | Matched against the five fixed anchors only; anything else is ignored. |

## Open questions
None.
