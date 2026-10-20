# Development Plan: Project Context — Plan A (engine and contracts)

**Spec:** specs/L05-project-context.md (SPEC-01, approved, revised 2026-10-18) · **Base commit:** 8ae3e2b (the spec file itself is uncommitted)
**Packages:** server, @devdigest/shared (server + client mirror), reviewer-core, client (run trace drawer only) · **Size:** L (12 steps)
**Execution mode:** multi (chosen by the user 2026-10-18)

Approved by the user 2026-10-18 ("approve and implement it"). Open question (kind fallback for custom roots) resolved by default: `docs`, not asserted by an AC.

## Goal
Every review run reads the documents attached to its agent and to the agent's effective skills from the repo clone. It injects them under `## Project context` as fenced untrusted data, with no extra LLM call. The trace drawer shows what was read, what was skipped, and the full text. The server also provides the listing, preview and attachment APIs that Plan B's UI will use.

## Acceptance criteria (from the spec, unchanged)
- AC-1, AC-3, AC-62 — root globs, `kind`, `.git/` and `node_modules/` never walked → `test/project-context-helpers.test.ts`, `test/docs-reader.test.ts` · S3, S4
- AC-2, AC-4, AC-5, AC-7, AC-8, AC-9, AC-31, AC-63, AC-65 — listing and file routes → `test/project-context-docs.it.test.ts` (+ reader test for AC-7, AC-63) · S4, S6
- AC-6 — clone-free path rules → helpers test (rules), docs .it (file route), attachments .it (PUT) · S3, S6, S7
- AC-10–AC-14, AC-64, AC-66 — attachment storage and routes → `test/project-context-attachments.it.test.ts` (+ repository .it for AC-14) · S5, S7
- AC-15 — contracts in `@devdigest/shared`, mirrored; new trace keys nullish → `test/contracts.test.ts` + `diff` · S1
- AC-16, AC-18, AC-19, AC-23, AC-24, AC-25, AC-26, AC-30 — run plan builder → `test/project-context-prompt.test.ts` · S9
- AC-20, AC-21, AC-22 — reviewer-core framing line, prompt unchanged when empty → `reviewer-core/test/prompt.test.ts` (+ AC-20 in prompt test S9) · S8, S9
- AC-17, AC-27, AC-28, AC-29, AC-60 — executor wiring and trace → `test/reviews-project-context.it.test.ts` · S10
- AC-54–AC-58 — trace drawer → `SpecsBlocks.test.tsx`, `RunTraceDrawer.test.tsx` · S11
- AC-61 — manual demonstration, recorded in the evidence log · S12

## Requirements decisions
| # | Question / recommendation | Decision | Effect on the plan |
|---|---|---|---|
| Q1 | NFR-2 vs AC-7 / AC-31 | A: the listing reads and scans every file, returns no content; a cache is optional | S6 reads each matched file through the reader; no cache unless NFR-2 fails |
| Q2 | Storage | A: `agent_context_docs` and `skill_context_docs` | S5 |
| Q3 | Usage data | A: `GET /context/attachments` (AC-66) | S7 |
| Q4 | File-system port | A: server-local `adapters/docs/` | S4 |
| Q5 | AC-6 at PUT | A: clone-free checks only; realpath at read time (AC-63) | S3, S7 |
| R1, R2 | Limits; skip `.git` / `node_modules` | In the spec as AC-62, AC-64, AC-65, NFR-1 | S3, S4, S6, S7 |
| R3, R4 | `kind` fallback; `synced_at` source | Rejected | `synced_at` = `last_polled_at`; `kind` fallback = `docs` (not asserted) |
| R5 | Token counting | `specs_tokens` and the 8 000 budget are counted on the server's document texts joined with `\n\n` | S9 |
| R6 | Hardening | Reuse the exported `hardenSkillBody` (`reviews/skills-prompt.ts:61`), same module | S9 |
| R7 | Glob library | `pnpm add picomatch` + `-D @types/picomatch` | S2 |
| R10 | Doc security status | `ContextDocSecurity.status`: `clean \| flagged` (not `blocked`) | S1, S6 |
| R14 | NFR-3 e2e choice | e2e flow of the not-cloned state | Plan B |
| R15 | AC-61 | Manual demonstration | S12 |
| R8, R9, R11–R13, R16 | Client UI items | Accepted | Plan B (R17 → S11) |
| — | Planner interpretations | File route: no clone → 404; path under `.git/` or `node_modules/` → 422 `invalid_context_path`; missing or non-UTF-8 file → 404. A path containing a control character fails AC-6 (header-line safety, no new behaviour for valid paths). | S6, S3 |

## Key constraints
| Source (file:line) | Rule or insight | Effect on this plan |
|---|---|---|
| `server/src/adapters/git/simple-git.ts:130` | `readFile(...,'utf8')` replaces invalid bytes silently | The reader decodes with `TextDecoder('utf-8',{fatal:true})` |
| `server/INSIGHTS.md:137` | `MockGitClient.readFile` returns `''` for a missing file | Docs tests use `MockDocsReader`, never `MockGitClient.readFile` |
| `server/INSIGHTS.md:172`, `reviews/skills-prompt.ts:96` | `skills_tokens` is counted on the joined section | `specs_tokens` follows the same rule (R5) |
| `server/INSIGHTS.md:41`, `platform/prompt-log.ts:119` | `prompt.assembled` carries a manifest; previews only for constant sections | The framing line is a trusted constant segment; document text never reaches logs (AC-30) |
| `server/INSIGHTS.md:65` | A run that gains a call needs harness mocks | No new LLM call; the S10 .it test overrides `docs` and `llm` |
| `server/INSIGHTS.md:53` | `status='done'` is written before the trace | The S10 test waits with `test/helpers/runs.ts` `waitForPrRuns`, then polls for the trace |
| `server/src/platform/errors.ts:7` | Zod failures map to `validation_error` 422 | AC-6 errors are thrown as `AppError('invalid_context_path', …, 422)` in the service, not by Zod refinement. Duplicates and >100 paths are 422 from Zod. |
| `INSIGHTS.md:36`, `shared-contracts` rule 5 | `vendor/shared/adapters.ts` already differs between copies | Not touched; the port lives in `server/src/adapters/docs/` |
| `server/src/vendor/shared/contracts/knowledge.ts:175` | `SKILL_BODY_MAX = 20_000` | The per-document cap reuses it (NFR-1 "same value") |
| picomatch defaults | `dot:false` skips dot folders such as `.github/docs` | Match with `{ dot: true }`; `.git` is pruned by AC-62. The walk does not descend into symlinked directories (no loops); symlinked files are kept only if their realpath is inside the clone. |

## Constraints hit
- Migrations: new tables go through the schema file → `pnpm db:generate --name l05_project_context` → a new `0015_*` file. No existing migration is edited.
- Lock file: changes only as a side effect of S2's `pnpm add` in `server/`.
- `vendor/shared`: the server copy is edited first and mirrored in the same step; `diff` must be empty for `contracts/project-context.ts`, `contracts/trace.ts` and `index.ts`.
- `reviewer-core/src/index.ts`: additions only (the framing constant); nothing renamed.
- Layering: the new module `modules/project-context/` copies `modules/agents/` (routes → service → repository); routes never touch `container.db` or `container.docs`.

## Contract & data changes
| Contract / table | Before → after | Optional/nullable choice | Consumers to update |
|---|---|---|---|
| `contracts/project-context.ts` (new) | — → `ContextDocKind`, `ContextDocItem {path,kind,size,tokens_estimate,injection_detected}`, `ContextListing {cloned,roots,synced_at,truncated,documents}`, `ContextDocSecurity`, `ContextDocFile {…item, content, security}`, `ContextFileQuery {path}`, `ContextAttachments {paths}`, `PutContextAttachmentsBody` (`paths` array `.max(CONTEXT_ATTACHMENTS_MAX=100)`, refined unique), `WorkspaceContextAttachments {agents:[{id,name,paths,inherited:[{skill:{id,name},paths}]}], skills:[{id,name,paths}]}` | `synced_at` nullable | server routes (S6, S7); client hooks in Plan B |
| `PromptAssembly` (`trace.ts:56`) | + `specs_blocks: ProjectContextBlock[]`, `specs_tokens`, `specs_skipped: ProjectContextSkip[]` | nullish (stored jsonb) | executor S10, drawer S11 |
| `RunTrace.config` (`trace.ts:103`) | + `clone_sha` | nullish | executor S10 |
| `ProjectContextBlock` / `ProjectContextSkip` (new, trace.ts) | `{path,kind,origin,tokens,text,truncated}` / `{path, reason: not_found\|unreadable\|not_utf8\|invalid_path\|not_cloned\|over_budget}` | — | S9, S10, S11 |
| `agent_context_docs` / `skill_context_docs` (new) | `agent_id`/`skill_id` uuid FK `on delete cascade`, `path text`, `position int`, PK (owner, path) | not null | S5 repository |

## Steps
### S1 — Shared contracts  [package: server + client mirror · layer: contracts]
- **Skills:** shared-contracts, zod, test-strategy
- **Files:** create `server/src/vendor/shared/contracts/project-context.ts` · modify `server/src/vendor/shared/contracts/trace.ts:56-77,103-111` (new block/skip schemas, `PromptAssembly` keys, `config.clone_sha`) · modify `server/src/vendor/shared/index.ts:24` (one `export *`) · mirror all three to `client/src/vendor/shared/`
- **Test first:** `server/test/contracts.test.ts` — `AC-15:` cases: an old trace without the new keys parses; `PutContextAttachmentsBody` with 101 paths fails; with a duplicate path fails; `ContextListing` with `synced_at:null` parses
- **Implement:** schemas per the table above. `skill` in `inherited` is `{id,name}` (Plan B needs the name). Copy the shape of `SkillPromptBlock` at `trace.ts:45`.
- **Verify:** `cd server && pnpm exec vitest run test/contracts.test.ts && pnpm typecheck`; `cd client && pnpm typecheck`; `diff` of each mirrored file is empty
- **Depends on:** —
- **Done when:** AC-15

### S2 — Glob dependency  [package: server · layer: docs]
- **Skills:** security
- **Files:** `server/package.json`, `server/pnpm-lock.yaml` (side effect only)
- **Test first:** no test: dependency only. Covered by S3's matcher tests.
- **Implement:** `cd server && pnpm add picomatch && pnpm add -D @types/picomatch`. Reason: a brace + globstar matcher (AC-1), already present transitively, pure and without I/O.
- **Verify:** `cd server && pnpm typecheck`
- **Depends on:** —
- **Done when:** the dependency is declared directly

### S3 — Config, constants, path helpers  [package: server · layer: service (pure domain)]
- **Skills:** onion-architecture, fastify-best-practices, security, test-strategy
- **Files:** modify `server/src/platform/config.ts:15-45,47-74,76-99` (`PROJECT_CONTEXT_ROOTS` comma-separated → `projectContextRoots: string[]`, default per AC-1) · create `server/src/modules/project-context/constants.ts` (`CONTEXT_LISTING_CAP=500`, `CONTEXT_PATH_MAX=512`, `CONTEXT_FILE_READ_MAX_BYTES=1_048_576`, `CONTEXT_DOC_MAX_CHARS=SKILL_BODY_MAX`, `PROJECT_CONTEXT_MAX_TOKENS=8000`, `EXCLUDED_DOC_DIRS=['.git','node_modules']`) · create `server/src/modules/project-context/helpers.ts`
- **Test first:** `server/test/config-project-context.test.ts` (`AC-1:` default roots; env override split and trimmed). `server/test/project-context-helpers.test.ts`:
  - `AC-6:` absolute, `..` segment, `.txt`, unmatched root, 513 chars and a control character are each rejected; a valid `specs/a.md` is accepted
  - `AC-3:` `INSIGHTS.md` → insights, `a/insights/x.md` → insights, `docs/specs/x.md` → specs, `specs/docs/x.md` → docs
  - `AC-1:` `INSIGHTS.md` at the root and `.github/docs/x.md` match
  - `AC-62:` `node_modules/p/docs/x.md` is excluded
  - `AC-2:` `tokensEstimate(5) = 2`
- **Implement:** pure functions `makeRootMatcher(roots)` (picomatch `{dot:true}`), `contextPathError(path, matcher): string|null`, `docKind(path)`, `tokensEstimate(size)`, `isExcludedDocPath(path)`. No I/O.
- **Verify:** `cd server && pnpm exec vitest run test/config-project-context.test.ts test/project-context-helpers.test.ts && pnpm typecheck`
- **Depends on:** S2
- **Done when:** the rule parts of AC-1, AC-3, AC-6 and AC-62 are proven

### S4 — Docs reader port, fs adapter, mock, container  [package: server · layer: repository (edge adapter)]
- **Skills:** onion-architecture, fastify-best-practices, security, test-strategy
- **Files:** create `server/src/adapters/docs/index.ts` (port `DocsReader { list(root, match): Promise<{path,size}[]>; read(root, path, opts?: {maxBytes?}): Promise<DocRead> }`, where `DocRead = {ok:true,content,size} | {ok:false,reason:'not_found'|'unreadable'|'not_utf8'|'invalid_path'|'too_large'}`; re-exports `FsDocsReader`, following `adapters/tokenizer/index.ts`) · create `server/src/adapters/docs/fs.ts` · modify `server/src/adapters/mocks.ts:322` (add `MockDocsReader` before Mock CodeIndex: files given as text, invalid bytes or an error reason) · modify `server/src/platform/container.ts:43-58,96-100` (`docs?: DocsReader` override + lazy `get docs()`)
- **Test first:** `server/test/docs-reader.test.ts`, temp-dir fixtures (copy `test/indexer-walk.test.ts:29`):
  - `AC-62:` nothing under `.git/` or `node_modules/` is listed, and reading one gives `invalid_path`
  - `AC-63:` a symlink to a file outside the root is not listed, and reading it gives `invalid_path`
  - `AC-7:` invalid UTF-8 bytes give `not_utf8`
  - a missing file gives `not_found`
  - `maxBytes` exceeded gives `too_large`
  - only paths accepted by `match` are listed, each with its byte size
- **Implement:** recursive `readdir({withFileTypes})`; prune excluded names at any depth; do not follow symlinked directories. For matched entries: `realpath` and check the result is inside `realpath(root)+sep`, then `stat`. In `read`: reject excluded segments, `..` and absolute paths first; map ENOENT → `not_found` and other errors → `unreadable`; decode with fatal `TextDecoder`. All I/O stays in the adapter.
- **Verify:** `cd server && pnpm exec vitest run test/docs-reader.test.ts && pnpm typecheck`
- **Depends on:** S3
- **Done when:** the reader parts of AC-7, AC-62 and AC-63 are proven

### S5 — Attachment tables + repository  [package: server · layer: db + repository]
- **Skills:** db-schema-change, drizzle-orm-patterns, postgresql-table-design, onion-architecture, test-strategy
- **Files:** create `server/src/db/schema/project-context.ts` · modify `server/src/db/schema.ts:27` (add `export *`) · generated `server/src/db/migrations/0015_l05_project_context.sql` + `meta/` (via `pnpm db:generate --name l05_project_context`; read the SQL) · create `server/src/modules/project-context/repository.ts` (`ContextAttachmentsRepository`: `pathsForAgent`, `pathsForSkills(ids)`, `replaceForAgent` / `replaceForSkill` (one transaction: delete + insert with `position` = index), `listForWorkspace(ws)` joined through agents/skills `workspace_id`) · modify `server/src/platform/container.ts:76-113` (`get contextDocsRepo()`, same pattern as `agentsRepo`)
- **Test first:** `server/test/project-context-repository.it.test.ts`:
  - `AC-10/AC-11:` replace then read returns the same order
  - a second replace drops the old rows
  - `AC-14:` deleting an agent or a skill removes its rows (cascade)
  - `AC-13:` `agents.version` and `skills.version` are unchanged after a replace
- **Implement:** follow `agent_skills` (`schema/agents.ts:51-65`); tenancy goes through the owner (no `workspace_id` column, same as `agent_skills`). Run `pnpm db:migrate` locally.
- **Verify:** `scripts/it-db.sh run server/test/project-context-repository.it.test.ts`; `cd server && pnpm typecheck`
- **Depends on:** S1
- **Done when:** AC-13 and AC-14 are proven at the storage level

### S6 — Listing and file routes  [package: server · layer: service + route]
- **Skills:** onion-architecture, fastify-best-practices, security, zod, test-strategy
- **Files:** create `server/src/modules/project-context/service.ts` (`ProjectContextService(container)`), `server/src/modules/project-context/routes.ts` (`GET /repos/:id/context`, `GET /repos/:id/context/file` with `IdParams` + `ContextFileQuery`) · modify `server/src/modules/index.ts:42` (register `projectContext`) · extend `helpers.ts` (`composeListing(entries, reads, cap)` pure)
- **Test first:**
  - `server/test/project-context-helpers.test.ts` adds `AC-5:` 501 valid entries → 500 by path + `truncated:true`; `AC-7:` non-UTF-8 entries are dropped before the cap
  - `server/test/project-context-docs.it.test.ts` (seeded repo; `repos.clonePath` set to a temp-dir fixture; real `FsDocsReader`):
    - `AC-2:` sorted items with no `content` key
    - `AC-8:` seeded not-cloned repo → `cloned:false`, `[]`
    - `AC-9:` `roots` and `synced_at` present
    - `AC-31:` a flagged doc has `injection_detected:true` and the file route returns `security.status:'flagged'` with findings
    - `AC-4:` full content returned
    - `AC-6:` `?path=../x.md` → 422 `invalid_context_path`
    - `AC-63:` a symlink escape → 422
    - `AC-62:` a `node_modules` path → 422
    - `AC-65:` a 1 MB + 1 byte file → 413 with no content
    - unknown repo → 404
    - `NFR-2:` 500 docs listed in < 500 ms (measured once)
- **Implement:** the service resolves the repo via `ReposRepository(container.db).getById`, then `container.docs.list(clonePath, matcher)`. It reads each entry until 500 valid documents are collected, scans each with `scanSkillBody` (`skills/injection.ts:133`; the same cross-module pure import as `reviews/skills-prompt.ts:13`) and maps `blocked` → `flagged`. File route order: AC-6 check (422) → no clone 404 → `read(…,{maxBytes})`; `too_large` → `AppError('context_file_too_large',…,413)`, `invalid_path` → 422, `not_found` / `not_utf8` → 404. Routes only validate, delegate and map; copy `modules/agents/routes.ts:105`.
- **Verify:** `cd server && pnpm exec vitest run test/project-context-helpers.test.ts && pnpm typecheck`; `scripts/it-db.sh run server/test/project-context-docs.it.test.ts`
- **Depends on:** S3, S4
- **Done when:** AC-2, AC-4, AC-5, AC-7, AC-8, AC-9, AC-31, AC-62, AC-63, AC-65 (+ AC-6 on the file route)

### S7 — Attachment routes and workspace aggregate  [package: server · layer: service + route]
- **Skills:** onion-architecture, fastify-best-practices, security, zod, test-strategy
- **Files:** modify `server/src/modules/project-context/service.ts` and `routes.ts` (`GET`/`PUT /agents/:id/context`, `GET`/`PUT /skills/:id/context`, `GET /context/attachments`)
- **Test first:** `server/test/project-context-attachments.it.test.ts`:
  - `AC-10/AC-11:` PUT then GET keeps the order, and PUT returns the saved list
  - `AC-12:` a duplicate path → 422
  - `AC-64:` 101 paths → 422 and the list is unchanged
  - `AC-6:` `/abs.md` → 422 `invalid_context_path`; a valid path that is missing from every clone is accepted (Q5)
  - `AC-13:` the version is unchanged
  - an agent of another workspace or an unknown agent → 404
  - `AC-66:` every agent and skill is listed; `inherited` follows the agent's skill order; a globally disabled, a link-disabled, an unlinked and an L03b-blocked skill are each absent
- **Implement:** ownership via `container.agentsRepo.getById` / `container.skillsRepo.getById` → `NotFoundError`. Before replacing, every path goes through `contextPathError` (S3). For the aggregate, each agent's inherited skills come from `container.skillsRepo.effectiveSkillsForAgent` + `partitionBlockedSkills` (`reviews/skills-prompt.ts:108`), the same rule a run uses (AC-27). One query per agent is acceptable; noted in Risks.
- **Verify:** `cd server && pnpm typecheck`; `scripts/it-db.sh run server/test/project-context-attachments.it.test.ts`
- **Depends on:** S5, S3
- **Done when:** AC-10, AC-11, AC-12, AC-13, AC-64, AC-66 (+ AC-6 on PUT)

### S8 — reviewer-core framing line  [package: reviewer-core · layer: reviewer-core]
- **Skills:** typescript-expert, security, test-strategy
- **Files:** modify `reviewer-core/src/prompt.ts:146-149,172,227-230` · modify `reviewer-core/src/index.ts` (add the export of `PROJECT_CONTEXT_FRAME` only)
- **Test first:** `reviewer-core/test/prompt.test.ts`:
  - `AC-21:` with specs present, the line right after `## Project context` is the constant (it mentions documented rules, reference use, and naming the path)
  - `AC-21:` the manifest has a trusted `specs:frame` segment
  - `AC-22:` without specs, `assembly` and `messages` are deep-equal to the output before the change (snapshot of a fixed input)
  - `AC-20:` each spec is in an `<untrusted source="spec-N">` block and the guard is in the system message
- **Implement:** a constant trusted line and the user section `## Project context\n${FRAME}\n\n${specsBlock}`. Manifest: `specs:frame` segment (source `reviewer-core`, trust `trusted`, with preview), then the existing `spec:N` segments without the heading prefix duplicated. `assembly.specs` stays the blocks only.
- **Verify:** `cd reviewer-core && npm test -- prompt && npm run typecheck`; `cd server && pnpm typecheck`
- **Depends on:** —
- **Done when:** AC-20, AC-21, AC-22

### S9 — Run-time project-context plan (pure)  [package: server · layer: service (pure domain)]
- **Skills:** onion-architecture, security, test-strategy
- **Files:** create `server/src/modules/reviews/project-context-prompt.ts`
- **Test first:** `server/test/project-context-prompt.test.ts` (`MockDocsReader`, char tokenizer as in `test/reviews-skills.test.ts:11`):
  - `AC-16:` agent `[a,b]` + skill X `[b,c]` + skill Y `[a,d]` → `a,b,c,d` with origins `agent, agent, skill:X, skill:Y`
  - `AC-18:` each text starts with `### Document: <path>`
  - `AC-19:` `# H` → `#### H` outside a fence; `</untrusted>` is escaped
  - `AC-23:` 20 001 characters → 20 000 + `[truncated]` and `truncated:true`
  - `AC-24:` the doc that crosses 8 000 tokens and every later one are skipped as `over_budget`
  - `AC-25:` `not_cloned` (null clone path), `not_found`, `unreadable`, `not_utf8`, `invalid_path` (AC-6 / AC-62 / AC-63 rule failure)
  - `AC-26:` the log line in both forms (`project context: N doc(s) injected (T tokens), M skipped (p — reason, …)` and `project context: none attached`)
  - `AC-30:` `buildPromptAssembledEvent` over the `assemblePrompt` sections, with a sentinel document text, does not contain the sentinel
  - `AC-20:` the assembled prompt holds every document inside the guard-fenced blocks
- **Implement:**
  - `orderContextPaths(agentPaths, skills:{name,paths}[])`
  - `readProjectDocs(reader, clonePath|null, entries, matcher)`
  - `buildProjectContextPlan(reads, tokenizer)` → `{texts, blocks, skipped, totalTokens, readPaths}`
  - `projectContextLogLine(plan, attachedCount)`

  The header and body go through `hardenSkillBody` (`skills-prompt.ts:61`), after truncating the raw content. The budget runs on `texts.join(SPECS_JOINER)`; `SPECS_JOINER = '\n\n'` must match `reviewer-core/src/prompt.ts:148`.
- **Verify:** `cd server && pnpm exec vitest run test/project-context-prompt.test.ts && pnpm typecheck`
- **Depends on:** S1, S3, S4, S8
- **Done when:** AC-16, AC-18, AC-19, AC-23, AC-24, AC-25, AC-26, AC-30 (+ AC-20)

### S10 — Executor wiring, trace, clone sha  [package: server · layer: service]
- **Skills:** onion-architecture, fastify-best-practices, security, test-strategy
- **Files:** modify `server/src/modules/reviews/run-executor.ts:59-71` (`ExecCtx.cloneSha`), `:174` (resolve `container.git.currentHead` once when `repo.clonePath` is set; on error → null), `:82` and `:266-333` (after the skills partition: build the plan from `usableSkills` and pass `specs` only when non-empty; log line), `:390-421` (`specs_read`, `specs_blocks`, `specs_tokens`, `specs_skipped`, `config.clone_sha`) · constructor: add a `ProjectContextSource` port (`pathsForAgent`, `pathsForSkills`) · modify `server/src/modules/reviews/service.ts:36` (pass `container.contextDocsRepo`)
- **Test first:** `server/test/reviews-project-context.it.test.ts` (copy `test/reviews-skills.it.test.ts`; seed; set `clonePath`; overrides `docs: MockDocsReader`, `llm: MockLLMProvider`):
  - `AC-60/AC-17:` 2 agent docs + 1 skill doc → the captured prompt and `trace.specs_read` / `specs_blocks` hold all three in AC-16 order, with texts
  - `AC-27:` a link-disabled skill and an L03b-blocked skill contribute nothing
  - `AC-28:` the LLM call count equals that of the same run without attachments
  - `AC-29:` `specs_tokens`, `specs_skipped`, `clone_sha` and `origin` are present
  - `AC-25:` no clone → run done, `specs_skipped` has `not_cloned`
  - `AC-26:` the trace log has the summary line
  - `AC-30:` no log line contains the sentinel document text
- **Implement:** a lookup failure for attachments fails the run, the same rule as skills (comment at `run-executor.ts:258`). Document reads never fail it (AC-25). `traceFromBuffer` (`:562`) stays without the new keys (EC-20).
- **Verify:** `cd server && pnpm typecheck && pnpm exec vitest run test/project-context-prompt.test.ts`; `scripts/it-db.sh run server/test/reviews-project-context.it.test.ts`
- **Depends on:** S5, S9
- **Done when:** AC-17, AC-25, AC-26, AC-27, AC-28, AC-29, AC-30, AC-60

### S11 — Trace drawer project-context section  [package: client · layer: component]
- **Skills:** frontend-architecture, react-best-practices, next-best-practices, react-testing-library, test-strategy
- **Files:** create `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/SpecsBlocks/{SpecsBlocks.tsx,index.ts,SpecsBlocks.test.tsx}` (copy `SkillsBlocks/`) · modify `…/RunTraceDrawer/_components/TraceBody/TraceBody.tsx:92-94` · modify `client/messages/en/runs.json:45-60` (`specsSection`, `specsSummary`, `specBlock`, `specsSkipped`, reason labels)
- **Test first:** `SpecsBlocks.test.tsx`:
  - `AC-55:` the header reads `Project context — attached specs (untrusted) · 2 docs · 120 tokens`; each sub-block is labelled `<path> · <origin> · <tokens> tokens`; expanding shows the full text; the copy control is present
  - `AC-57:` skipped rows show "not found" / reason labels

  `RunTraceDrawer.test.tsx`:
  - `AC-54:` "Specs read" lists the paths, or "none"
  - `AC-56:` Repo skeleton is rendered before Project context
  - `AC-58:` without `specs_blocks` → the legacy `specs` block, or no section
- **Implement:** render `SpecsBlocks` when `specs_blocks` or `specs_skipped` is non-empty; otherwise the existing fallback. Paths and origins render as plain text. Use type imports only from `@devdigest/shared`.
- **Verify:** `cd client && pnpm exec vitest run "src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer" && pnpm typecheck`
- **Depends on:** S1
- **Done when:** AC-54, AC-55, AC-56, AC-57, AC-58

### S12 — Demonstration of AC-61  [package: server · layer: docs]
- **Skills:** engineering-insights
- **Files:** none in the repo; evidence in `.claude/handoff/<slug>/` (git-ignored)
- **Test first:** no test: needs a real model (R15). AC-60 is the hermetic proof.
- **Implement:** with the user, run `./scripts/dev.sh` with a real provider key. In a cloned repo, `docs/architecture.md` states "module `api/` does not import `db/` directly". Attach it with `PUT /agents/:id/context`, review a PR where a file under `api/` imports from `db/`, and record the run id, the finding text naming the path, and the `specs_read` of the trace.
- **Verify:** manual; the evidence line cites the run id
- **Depends on:** S10
- **Done when:** AC-61 has been demonstrated (or is reported "not run: <reason>")

## Execution
Run with `/implement specs/plans/2026-10-18-project-context-a.md`.
multi: implementer ranges, each ending with every package type-checking:
- **S1–S5** (contracts, dependency, helpers, docs port, tables)
- **S6–S7** (HTTP API)
- **S8–S10** (prompt and run injection; reviewer-core and server typecheck)
- **S11–S12** (drawer, demonstration)

Then architecture-reviewer → fix loop → plan-verifier.

## Verification matrix (run after the last step)
| Package | Commands |
|---|---|
| server | `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'`; `scripts/it-db.sh run` on each of `project-context-repository`, `project-context-docs`, `project-context-attachments`, `reviews-project-context`, plus the existing `reviews-skills.it.test.ts` and `prompt-logging.it.test.ts` |
| reviewer-core | `cd reviewer-core && npm run typecheck && npm test`, then `cd server && pnpm typecheck` |
| client | `cd client && pnpm typecheck && pnpm test` (no new value import from `@devdigest/shared`, so no `pnpm build`) |
| shared | `diff` server vs client for `contracts/project-context.ts`, `contracts/trace.ts`, `index.ts` → empty |

## Risks
| Risk | Likelihood | Mitigation in plan |
|---|---|---|
| The NFR-2 timing test is flaky on a busy machine | Medium | Measured once in S6. If it fails, add the optional (path, mtime, size) cache; never weaken the assertion. |
| A `{dot:true}` match or symlink handling differs from what users expect | Low | Key constraints row; reader tests in S4 |
| Per-agent effective-skill queries in `GET /context/attachments` | Low | Acceptable for workspace-sized agent counts; a batch query is a later optimisation |
| The prompt-manifest change shifts existing segment expectations | Medium | S8's AC-22 snapshot; rerun `prompt-logging.it.test.ts` in the matrix |
| AC-61 depends on model behaviour | Medium | Manual demo with evidence; AC-60 proves the injection deterministically |
| Large `.md` files read in a run (no read cap at run time; EC-22) | Low | Content is truncated to 20 000 chars before hardening |

## Out of scope
- **Plan B (not expected by plan-verifier here):** AC-32–AC-53, AC-59, AC-67. Also the e2e flow for the not-cloned state (EC-2, R14), the client hooks, the cleanup of `useContextFiles`, `useReindexContext` and `SpecFile` (R16), the `Markdown` image-as-link prop (R8), the skill tab URL state (R9), the `InjectionChip` label prop (R10) and the client 500 constant mirror (R13).
- The spec's Non-goals (auto-selection, editing repo files, chunk index, per-repo attachments, PR-head reads, MCP and CI runner changes).
- Docs (`server/README.md` API map, the L02 tab-count amendment note) → doc-writer.
- For reviewers: architecture — the new `modules/project-context/` and the `ProjectContextSource` port. Security — `adapters/docs/fs.ts` containment, document hardening, and the 413 / 422 mapping.

## Open questions
- None blocking. `kind` for a custom root with no `specs`, `docs` or `insights` segment falls back to `docs` (R3 rejected; not asserted by an AC).
