# Spec: Project Context — attach repository docs to agents and skills
Spec ID: SPEC-01
Status: approved
Supersedes: —

Amends `specs/L02-review-skills.md`: requirement 35 (agent editor has "exactly two tabs") and the
decision "Skill page tabs: Config · Preview · Versioning". This spec adds a **Context** tab to the
agent editor and to the skill editor. Every other L02 requirement and decision stays in force.

## Problem and user
A DevDigest user who configures review agents in Skills Lab (`/agents/:id`, `/skills/:id`) has
project rules written down in the reviewed repository: specs, design docs, insights. A review run
today never sees them. The executor always writes `specs_read: []` and an empty `specs` slot
(`server/src/modules/reviews/run-executor.ts:421`). So a PR that breaks a documented invariant
(for example "module `api/` does not import `db/` directly") passes unless the agent's system prompt
happens to repeat the rule. The user cannot browse these documents in the studio. They cannot pick
which ones an agent should read, and the run trace cannot show what project knowledge a review used.

## Goals / Non-goals
Goals:
- The user can browse every project document of the active repo on a read-only **Project Context**
  page and preview it as rendered markdown.
- The user can attach documents, by relative path, to agents (agent editor **Context** tab) and to
  skills (skill editor **Context** tab). They can also attach from the Project Context page. Each
  attachment shows an estimated token cost.
- Every review run reads the attached documents from the PR's repository clone and adds them to the
  prompt under `## Project context` as untrusted, delimited data. This needs no extra LLM call.
- The run trace shows which documents were read, which were skipped, the tokens of each one, and the
  full injected text.

Non-goals:
- Automatic selection of documents from the PR content (a later lesson).
- Editing repository files from the studio. The page has no Edit mode, new file, new folder or
  upload. The clone is a read-only mirror that resync hard-resets.
- A chunk index, embeddings or the design's "COVERAGE" ring, and the "Indexed: N files · N chunks"
  footer.
- Per-repo attachments (agent + repo + path). Attachments are repo-independent paths.
- Reading documents from the PR head. The clone's default-branch working tree is used (EC-9).
- Agent editor tabs Evals / Stats / CI and skill editor tabs Evals / Stats.
- A new MCP tool or a change to existing MCP tool output.
- Context injection in the CI runner.
- Blocking documents that contain injection patterns. They are flagged, not blocked (AC-31).
- Bumping the agent or skill version when attachments change.

## User stories
- US-1 — As a reviewer, I want to browse my repo's specs, docs and insights in the studio, so that I
  know what project knowledge exists before I attach it.
- US-2 — As an agent author, I want to attach documents to an agent in a chosen order, so that
  every review by that agent is checked against those rules.
- US-3 — As a skill author, I want to attach documents to a skill, so that every agent using the
  skill inherits them.
- US-4 — As an agent or skill author, I want to see how many tokens the attachments add, so that I
  can control prompt cost.
- US-5 — As a reviewer reading a run, I want to see exactly which documents went into the prompt and
  their full text, so that I can trust or debug a finding.
- US-6 — As a reviewer, I want a finding that relies on a document to name that document, so that I
  can check the rule at its source.

## Acceptance criteria (EARS)

### Document reader (server)
- AC-1 — The server shall list project documents of a repo as every file in the repo's clone whose
  relative path matches one of the configured root globs. The roots come from one server
  configuration setting. The default is `**/{specs,docs,insights}/**/*.md` and `**/INSIGHTS.md`.
- AC-62 — The server's walk of the clone shall never descend into a `.git/` or `node_modules/`
  directory at any depth. Files there shall never be listed, returned by the file route or injected
  into a prompt, even when their path matches a root glob.
- AC-2 — `GET /repos/:repoId/context` shall return the documents, sorted by path ascending, without
  their content. Each item carries `path`, `kind`, `size` in bytes and `tokens_estimate` =
  `ceil(size / 4)`. `kind` is one of `specs | docs | insights`.
- AC-3 — The server shall set `kind` from the path: `insights` for a file named `INSIGHTS.md` or a
  path with an `insights/` segment, otherwise the root segment (`specs/` or `docs/`) nearest to the
  file name.
- AC-4 — `GET /repos/:repoId/context/file?path=<path>` shall return one document with its full
  content when the path passes AC-6.
- AC-5 — WHEN a repo has more than 500 matching documents, `GET /repos/:repoId/context` shall return
  the first 500 by path and a `truncated: true` flag.
- AC-6 — IF a path sent to `PUT /agents/:id/context`, `PUT /skills/:id/context` or
  `GET /repos/:repoId/context/file` is absolute, contains a `..` segment, does not end in `.md`,
  matches no configured root, or is longer than 512 characters, THEN the server shall reject the
  request with 422 `invalid_context_path`. These checks need no clone; saving an attachment applies
  only these checks.
- AC-63 — IF a path, when read from the clone, resolves (after following symlinks) outside the
  clone, THEN `GET /repos/:repoId/context/file` shall answer 422 `invalid_context_path`, and a
  review run shall skip that document with reason `invalid_path` (AC-25).
- AC-65 — IF the document requested from `GET /repos/:repoId/context/file` is larger than 1 MB,
  THEN the server shall answer 413 without returning its content.
- AC-7 — IF a matching file is not valid UTF-8, THEN the server shall leave it out of the listing
  and out of every prompt.
- AC-8 — IF the repo has no clone, THEN `GET /repos/:repoId/context` shall answer 200 with an empty
  list and `cloned: false`.
- AC-9 — The listing response shall include `roots` (the configured globs) and `synced_at` (the
  repo's `last_polled_at`, nullable).

### Attachments (server + contracts)
- AC-10 — `GET /agents/:id/context` and `GET /skills/:id/context` shall return the attached paths in
  their stored order.
- AC-11 — WHEN `PUT /agents/:id/context` or `PUT /skills/:id/context` receives `{ paths: string[] }`,
  the server shall replace the whole ordered list (order = array index), store paths only, and
  return the saved list.
- AC-12 — IF a `PUT …/context` body contains a duplicate path, THEN the server shall reject it with
  422.
- AC-64 — IF a `PUT …/context` body contains more than 100 paths, THEN the server shall reject it
  with 422 and leave the stored list unchanged.
- AC-66 — `GET /context/attachments` shall return:
  - every agent as `{ id, name, paths, inherited: [{ skill, paths }] }`;
  - every skill as `{ id, name, paths }`.

  `paths` is the stored order. `inherited` lists only the agent's effective skills under the same
  rules a run uses (globally enabled, enabled on the link, not blocked by L03b; AC-27), in the
  agent's skill order.
- AC-67 — The Project Context page ("Used by N agents", AC-38; **Attach to…**, AC-39) and the agent
  Context tab's inherited rows (AC-44) shall take their data from `GET /context/attachments`, so the
  UI and a review run agree on which skill documents an agent inherits.
- AC-13 — WHEN an attachment list is saved, the server shall leave the agent's or skill's `version`
  unchanged.
- AC-14 — WHEN an agent or a skill is deleted, the server shall delete its attachment list with it.
- AC-15 — The attachment and listing contracts shall be defined in `@devdigest/shared` (server copy
  canonical, client copy identical). New keys on stored `RunTrace` documents shall be optional
  (`nullish`).

### Run-time injection (server + reviewer-core)
- AC-16 — WHEN a review run starts, the server shall build the run's document list in this order:
  1. the agent's attached paths, in agent order;
  2. then the attached paths of each skill injected into this run, in the agent's skill order.

  A path that repeats shall be kept only at its first position.
- AC-17 — WHEN a review run starts, the server shall read each listed document from the working tree
  of the PR's repository clone and pass the texts to reviewer-core as `specs`, in list order.
- AC-18 — The server shall begin each injected document text with a header line that names its
  relative path. This header shall sit inside the document's untrusted block.
- AC-19 — The server shall demote markdown headings in a document body outside fenced code, so they
  nest under the path header. It shall escape `<untrusted` and `</untrusted` look-alikes before the
  text reaches reviewer-core.
- AC-20 — The prompt shall contain every injected document inside the existing `## Project context`
  section as an `<untrusted …>` block, with the existing injection guard in the system message.
- AC-21 — WHERE at least one document is injected, reviewer-core shall place one constant trusted
  line directly under the `## Project context` heading. The line shall say that the documents
  describe the project's documented rules, are to be used as reference, and that a finding relying
  on one names its path. No export of `reviewer-core/src/index.ts` is renamed or removed.
- AC-22 — WHERE no document is injected, the assembled prompt shall be identical to the prompt
  produced without this feature.
- AC-23 — IF a document's content exceeds 20 000 characters, THEN the server shall inject its first
  20 000 characters followed by a visible `[truncated]` marker.
- AC-24 — IF adding the next document would take the project context section above 8 000 tokens
  (server tokenizer), THEN the server shall drop that document and every later one in the list.
- AC-25 — IF the PR's repo has no clone, or a listed path is missing, unreadable, not UTF-8, or fails
  AC-6, AC-62 or AC-63, THEN the server shall skip that document and continue the run.
- AC-26 — WHILE a review run assembles its project context, the server shall write one run-log line
  of the form `project context: N doc(s) injected (T tokens), M skipped (<path — reason>, …)`. When
  nothing is attached, the line shall be `project context: none attached`.
- AC-27 — A skill that is disabled globally, disabled on the agent link, or blocked by the L03b
  detector shall contribute no documents to the run.
- AC-28 — Adding project context shall add no LLM call to a review run.

### Run trace
- AC-29 — WHEN a run completes, its trace shall record:
  - `specs_read`: the injected paths, in prompt order;
  - `prompt_assembly.specs_blocks`: one entry per injected document `{path, kind, origin, tokens,
    text, truncated}`, where `origin` is `agent` or `skill:<name>`;
  - `prompt_assembly.specs_tokens`: the tokenizer count of the whole joined section;
  - `prompt_assembly.specs_skipped`: one entry per skipped document `{path, reason}`, with reason
    one of `not_found | unreadable | not_utf8 | invalid_path | not_cloned | over_budget`;
  - `config.clone_sha`: the clone's `HEAD` sha, nullable.
- AC-30 — The `prompt.assembled` log event and every run-log line shall carry document paths, sizes
  and token counts only, never document text.

### Injection detector (L03b reuse)
- AC-31 — The server shall run the L03b injection detector over each document's content. It shall
  return `security` (status + findings) on `GET /repos/:repoId/context/file` and an
  `injection_detected` boolean per listing item. A flagged document stays attachable and injectable.

### Project Context page (client)
- AC-32 — The sidebar WORKSPACE section shall show a **Project Context** item linking to
  `/repos/:repoId/context`, with the shortcut `g x`.
- AC-33 — The Project Context page shall show the configured roots as its header and the document
  list as a tree grouped by folder.
- AC-34 — WHEN the user selects a document, the page shall show its rendered markdown preview and
  store the selection in the URL as `?path=<path>`.
- AC-35 — WHEN the page opens with `?path=<path>` that is in the listing, the page shall show that
  document selected. IF the path is not in the listing, THEN the page shall show a "Document not
  found in this repo" message.
- AC-36 — WHEN the user activates **Refresh**, the page shall re-request the listing and show a
  loading state until it answers.
- AC-37 — The page footer shall show `N documents · repo synced <relative time>` from the listing's
  count and `synced_at`, or `repo never synced` when `synced_at` is null.
- AC-38 — For the selected document, the page shall show "Used by N agents". N counts the agents
  that attach the path directly or through a skill injected into their runs. Hover or keyboard focus
  shall list the agents' names.
- AC-39 — WHEN the user opens **Attach to…** on the selected document, the page shall show one
  checkbox per agent and one per skill, checked when that agent or skill attaches the path.
- AC-40 — WHEN the user checks an agent or skill in **Attach to…**, the client shall append the path
  to the end of that agent's or skill's list. WHEN the user unchecks it, the client shall remove the
  path, keeping the order of the rest.
- AC-41 — The page shall offer no Edit mode, new file, new folder or upload control.

### Agent editor Context tab (client)
- AC-42 — The agent editor shall show the tabs Config, Skills and Context, with Context reachable at
  `?tab=context`.
- AC-43 — The Context tab shall show the heading `Project context · X of Y attached`. X is the
  agent's attached path count and Y is the active repo's listed document count.
- AC-44 — The Context tab shall list:
  1. the agent's attached documents first, in prompt order;
  2. then the documents inherited from the agent's enabled, non-blocked skills, read-only and marked
     `via skill <name>`;
  3. then every other document of the active repo, sorted by path.

  Each row shows a checkbox, file name, folder, `kind` badge and a Preview control.
- AC-45 — WHEN the user checks a document, the tab shall append it to the end of the attached list
  and save it. WHEN the user unchecks it, the tab shall remove it and save.
- AC-46 — The tab shall let the user reorder attached rows by drag and drop and by ↑/↓ buttons. Each
  reorder shall be saved as the new full order.
- AC-47 — The tab shall show a footer `≈ N tokens · Injected as an untrusted block (## Project
  context) into every run.` N is the sum of `tokens_estimate` over attached and inherited documents,
  counting each path once.
- AC-48 — WHEN the user types in the filter box, the tab shall show only rows whose path contains
  the text (case-insensitive) and keep attached rows' order.
- AC-49 — WHEN the user activates Preview on a row, the client shall open the document's rendered
  preview in a side panel without leaving the tab.
- AC-50 — IF an attached path is not in the active repo's listing, THEN the tab shall show the row
  with a "not in this repo" label, an enabled uncheck control and no Preview control.

### Skill editor Context tab (client)
- AC-51 — The skill editor shall show a Context tab next to its existing tabs, reachable at
  `?tab=context`.
- AC-52 — The skill Context tab shall show the heading `Project context to use · N attached`, the
  note "Any agent using this skill inherits these documents.", and the rows and controls of
  AC-45–AC-50 (attach, reorder, filter, preview, not-in-this-repo).
- AC-53 — The skill Context tab shall show an "Adds to ## Project context" box listing the attached
  paths in order, and `None` when nothing is attached.

### Run trace drawer (client)
- AC-54 — The trace Configuration's "Specs read" row shall list `specs_read`, or "none" when empty.
- AC-55 — The trace Prompt assembly shall show a section labelled `Project context — attached specs
  (untrusted) · N docs · T tokens` (N = number of `specs_blocks`, T = `specs_tokens`). It holds one
  expandable, copyable sub-block per document, labelled `<path> · <origin> · <tokens> tokens`, with
  its full injected text.
- AC-56 — The trace Prompt assembly shall list its sections in the order they appear in the prompt
  (Repo skeleton before Project context).
- AC-57 — WHERE `specs_skipped` is not empty, the Project context section shall list each skipped
  path with its reason as "not found" or the reason label.
- AC-58 — WHERE a trace has no `specs_blocks` (older traces), the drawer shall fall back to the
  single `prompt_assembly.specs` block when it is present, and show no Project context section when
  it is absent.

### Warnings and demonstration
- AC-59 — WHERE a listing item has `injection_detected` true (AC-31), the Project Context page list,
  the agent Context tab and the skill Context tab shall show an "Injection patterns detected" warning
  chip on that document's row. The page's preview of a flagged document shall show the same chip.
- AC-60 — WHEN a test review runs with a mock LLM, and the agent has two attached documents and one
  skill with one attached document, the captured prompt and the trace shall contain all three paths
  and texts in the AC-16 order.
- AC-61 — (Demonstration) WHEN a document stating "module `api/` does not import `db/` directly" is
  attached to an agent, and that agent reviews a PR in which a file under `api/` imports from `db/`,
  the review shall contain a finding that names that document's path.

## Edge cases
- EC-1 — No repo selected (no repos exist) → the page and both Context tabs show "Add a repository
  to see its project documents" with a link to add a repo.
- EC-2 — Active repo not cloned yet (e.g. seeded `acme/payments-api`, `server/src/db/seed.ts:170`) →
  `cloned: false`. The page and tabs show "This repository is not cloned yet — documents appear
  after the first sync". Attached rows show as "not in this repo" (AC-50). Runs skip with
  `not_cloned` (AC-25, AC-29).
- EC-3 — Clone has no matching documents → empty state naming the configured roots (it replaces the
  stale `.devdigest/specs/` text in `client/messages/en/context.json`).
- EC-4 — Listing request is loading → skeleton rows. It fails → error message with a Retry control.
  The editors keep the attached paths visible from `GET …/context`.
- EC-5 — Saving an attachment fails → the change is rolled back in the UI and an error toast names
  the action. A 422 `invalid_context_path` shows "This path cannot be attached".
- EC-6 — An attached document was deleted or renamed in the repo → AC-50 in the editors, AC-25 /
  AC-57 in runs.
- EC-7 — The same path is attached to the agent and to one of its skills, or to two skills → injected
  once at its first position (AC-16). Counted once in the token total (AC-47).
- EC-8 — A skill is disabled, unlinked or blocked → AC-27. Its documents vanish from the agent tab's
  inherited rows.
- EC-9 — The PR itself edits an attached document → the run reads the clone's default-branch version
  as of the last sync. `config.clone_sha` records which version was read (AC-29).
- EC-10 — A very large document → AC-23. A long list of attached documents → AC-24 (`over_budget`
  entries in the trace).
- EC-11 — More than 500 documents → AC-5. The page and tabs show "Showing first 500 documents".
- EC-12 — A path contains `..` → AC-6 (422 on save or preview). A symlink in the clone points
  outside it → AC-63 (checked at read time). Neither is ever listed or read.
- EC-13 — A non-UTF-8 `.md` file → AC-7.
- EC-14 — Very long file names or paths → truncated with an ellipsis. The full path shows on hover
  and keyboard focus.
- EC-15 — The filter matches nothing → "No documents match '<text>'".
- EC-16 — Two editors save the same agent's list at the same time → the last full replacement wins.
  The other editor shows the saved order after refetch.
- EC-17 — The user switches the active repo while on a Context tab → the list reloads for the new
  repo. Attached paths missing there show as "not in this repo".
- EC-18 — A document contains injection patterns → AC-31 and AC-59. It is still injected as fenced
  untrusted data behind the guard.
- EC-19 — Direct link, refresh or back navigation on `/repos/:repoId/context?path=…` → AC-35.
  `?tab=context` on the editors restores the tab.
- EC-20 — A run fails or is cancelled → the minimal trace has no `specs_blocks`. The drawer follows
  AC-58.
- EC-21 — An editor tries to attach a 101st document → AC-64. The UI rolls back the change and shows
  "An agent or skill can have at most 100 attached documents" (EC-5 pattern).
- EC-22 — A matching document over 1 MB → it stays listed with its size and estimate. The preview
  shows "This document is too large to preview (over 1 MB)" (AC-65). In a run it is read and capped
  by AC-23 and AC-24.
- EC-23 — A matching `.md` file inside `.git/` or `node_modules/` (e.g.
  `node_modules/pkg/docs/x.md`) → never listed, previewed or injected (AC-62).
- EC-24 — A path longer than 512 characters → 422 `invalid_context_path` on save or preview (AC-6).
- EC-25 — A path saved while it was valid later becomes a symlink outside the clone → the file route
  answers 422 and the run skips it as `invalid_path` (AC-63). The editors show the row as
  "not in this repo" (AC-50).

## Non-functional requirements
- NFR-1 — Limits, defined once each as named server constants:
  - per-document injection cap: 20 000 characters, the same value as the L02 skill body cap;
  - per-run project-context cap: 8 000 tokens;
  - listing cap: 500 documents;
  - attachment list cap: 100 paths per agent or skill (AC-64);
  - path length cap: 512 characters (AC-6);
  - file route read cap: 1 MB per document (AC-65).

  The client shows the listing cap in its "Showing first 500" note.
- NFR-2 — `GET /repos/:repoId/context` returns no document content. To apply AC-7 (UTF-8) and AC-31
  (injection scan) it may read and scan every matched file. It answers in ≤ 500 ms p95 for a clone
  with 500 matching documents. A cache keyed by path + mtime + size is allowed, but it is an
  implementation choice and not required.
- NFR-3 — Hermetic tests:
  - a server unit test (mock LLM, mock git) proves AC-16–AC-27 and AC-29, including order,
    de-duplication, truncation, budget drop and every skip reason;
  - a reviewer-core test proves AC-21 and AC-22;
  - client component tests cover AC-43–AC-59;
  - a DB-backed `*.it.test.ts` covers AC-10–AC-14, AC-64 and AC-66 (including a disabled, an
    unlinked and a blocked skill being absent from `inherited`);
  - server tests cover AC-6, AC-62, AC-63 and AC-65 (path rules, `.git/` and `node_modules/`
    exclusion, symlink escape, 1 MB cap);
  - the planner picks either a seeded docs fixture for `acme/payments-api` or an e2e flow of the
    not-cloned state (EC-2).
- NFR-4 — Security: the document text never appears in a log line, an SSE event or the
  `prompt.assembled` event (L03d AC7). It appears only in the stored trace and the prompt.
- NFR-5 — Accessibility:
  - every checkbox, Preview, ↑/↓, Refresh and Attach to… control has an accessible name that
    includes the document path;
  - the tree and lists can be operated with the keyboard alone;
  - the "Used by" names and the full path are reachable by focus.
- NFR-6 — i18n: every new user-facing string lives in `client/messages/en/*.json` (`context.json`,
  `agents.json`, `skills.json`, `runs.json`). The stale `.devdigest/specs/` empty-state text is
  removed.
- NFR-7 — Cost: no extra LLM call per run (AC-28). The prompt grows by at most 8 000 tokens plus the
  framing line.
- NFR-8 — Contract drift: `diff` of the server and client `vendor/shared` copies of every touched
  contract file prints nothing.

## Inputs and provenance
| Input | Source (table / route / adapter / model / user) | Freshness / owner |
|---|---|---|
| Document list (paths, sizes) | Repo clone working tree, via the git/file adapter; roots from server config | Listed per request. The clone reflects the default branch at the last sync (`Repo.last_polled_at`) |
| Document content | Repo clone working tree | Read per preview request and once per review run at run start |
| Root globs | Server configuration setting (`server/src/platform/config.ts`) | Process start; default `**/{specs,docs,insights}/**/*.md`, `**/INSIGHTS.md` |
| Agent attachments | New ordered path list per agent (DB) via `GET/PUT /agents/:id/context` | Written by the user; read at run start |
| Skill attachments | New ordered path list per skill (DB) via `GET/PUT /skills/:id/context` | Written by the user; read at run start |
| Effective skills of an agent | Existing `effectiveSkillsForAgent` + L03b blocked filter | Run start |
| Active repo | Client `useActiveRepo` (URL > localStorage > first repo) | Per navigation |
| Token estimate (editors) | `ceil(size / 4)` from the listing | Per listing |
| Token counts (trace) | Server tokenizer (`js-tiktoken`, `container.tokenizer`) | Run time |
| Injection status | L03b detector over document content | Computed on read, never stored |
| Clone HEAD sha | Git adapter `currentHead` | Run start |
| "Used by N agents", Attach to… state, agent tab inherited rows | `GET /context/attachments` (AC-66): agent and skill attachment lists + effective-skill rules (link enabled, skill enabled, not L03b-blocked) | Per request; same inheritance rules as a run (AC-27, AC-67) |

## Untrusted inputs
| Input | Who controls it | Required handling |
|---|---|---|
| Document content | Anyone with commit access to the reviewed repo | Fenced in an `<untrusted>` block behind the injection guard. Headings demoted, `<untrusted` look-alikes escaped, capped at 20 000 chars. Scanned by the L03b detector. Never logged. Rendered in the client as markdown with `skipHtml`, no `rehype-raw`, images shown as links (never loaded). |
| Document paths and file names | Repo committers; the user for attached paths | Validated by AC-6 on save and read (relative, no `..`, `.md`, inside a root, ≤ 512 chars) and by a Zod contract. AC-63 checks that the real path stays inside the clone at read time. AC-62 excludes `.git/` and `node_modules/`. Rendered as plain text. Placed in the prompt only on the header line inside the untrusted block, never in an attribute. |
| `?path=` URL parameter | Anyone who sends a link | Matched against the listing only. The file route applies AC-6. |
| LLM output citing a document | Model | Existing finding grounding and plain-text rendering apply. No new handling. |

## Open questions
None.
