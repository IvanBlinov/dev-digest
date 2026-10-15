# L04 homework — Blast Radius

Cross-module: `server/` (route + mapping), `vendor/shared` (contract), `client/` (Overview block),
`mcp/` (`get_blast_radius` replaces the lab stub).

## Problem
A reviewer sees the diff but not what else in the repo the change can break. Blast Radius answers
"what else can this diff affect?": the symbols declared in the changed files, who imports/calls
them, and which HTTP endpoints and crons depend on that code.

The data is already computed by `repo-intel` at clone/index time. This feature only **reads and
presents** it: no re-parsing, no AST/import-graph rebuild, no LLM call.

## What exists (do not rebuild)
- Facade `repoIntel.getBlastRadius(repoId, changedFiles)` → `BlastResult`
  (`server/src/modules/repo-intel/types.ts:74`): `changedSymbols`, flat `callers[]`
  (`file, symbol, viaSymbol, line, rank`), `impactedEndpoints`, `factsByFile`
  (`{endpoints, crons}` per caller file), `degraded` + `reason`
  (`flag_off | index_failed | index_partial | repo_too_large | no_data`). Never throws; already
  excludes the declaring file, resolves the caller function name, applies
  `MAX_CALLERS_PER_SYMBOL` / `BFS_DEPTH` from `server/src/modules/repo-intel/constants.ts`.
- Contract `BlastRadius` in `server/src/vendor/shared/contracts/brief.ts:89` (mirrored in `client/`).
- `githubBlobUrl` in `client/src/lib/github-urls.ts`; labels in `client/messages/en/blast.json`;
  `GET /repos/:id/index-state`, `POST /repos/:id/resync` (`server/src/modules/repo-intel/routes.ts`).
- `get_blast_radius` stub in `mcp/src/tools/get-blast-radius.ts` (schema: `repo`, `pr_number`, optional `file`).

## Decisions (settled with the user, 2026-10-13)
- Scope: **P1 + P2 + cheap P3** (collapsible tree, sort by rank, crons separate from endpoints,
  resync button next to the degraded badge, labels from `blast.json`). **Out:** Prior PRs block. Graph view added on 2026-10-14 at the user's request (see AC17).
- Contract: add optional `degraded?: boolean` and `reason?: <the five facade reasons>` to
  `BlastRadius` (both `vendor/shared` copies, same commit). Backward-compatible.
- Branch: `feat/l04-blast-radius` off `feat/l04-mcp-server`.

## Behaviour
### Server — `server/src/modules/blast/`, `GET /pulls/:id/blast` → `BlastRadius`
- Load the PR's changed files, call `getBlastRadius(repoId, changedFiles)` **once**, map to the contract.
- Mapping (pure helper, unit-tested): group flat `callers` by `viaSymbol` → `downstream[]`
  (`callers[{name: symbol, file, line}]`). Per group, `endpoints_affected` / `crons_affected` =
  de-duplicated union of `factsByFile[callerFile]` over that group's caller files (fallback when
  `factsByFile` is absent: endpoints empty per group). Order downstream by the highest caller `rank`
  (desc), then name. Changed symbols with no callers still appear in `changed_symbols`.
- `summary`: deterministic string from counts (symbols, callers, endpoints, crons). No model.
- `degraded` / `reason` passed through unchanged. Response validated against `BlastRadius`.
- Unknown PR → 404 via the existing error envelope.

### Client — Overview tab block "Blast radius"
- New hook in `client/src/lib/hooks/` (TanStack Query) for `GET /pulls/:id/blast`.
- Summary row: N symbols · N callers · N endpoints · N crons (labels from `blast.json`).
- Per changed symbol (collapsible, rank order): caller count, callers as `file:line` links to
  `githubBlobUrl(repo, headSha, file, line)` (new tab), then endpoint chips and, separately, cron chips.
- Empty state: `noDownstream` text when there are no callers. Degraded: a distinct badge with the
  reason, plus a Resync button → `POST /repos/:id/resync`.
- No hard-coded limits in the component; all strings via `next-intl`.

### MCP — `get_blast_radius`
- Calls `GET /pulls/:id/blast` (PR resolved via the existing `PrResolver`) and renders the same map
  concisely: summary, then per symbol its callers `file:line` and endpoints/crons; degraded reason
  when present. Optional `file` narrows to symbols declared in that changed file.
- `readOnlyHint: true`; short "when to call" description; unknown repo/PR → actionable `isError`.
- Repo-derived strings (symbol names, paths, endpoints) go through `oneLine` with caps (see `mcp/INSIGHTS.md`).
- Update the L04 MCP spec AC7 (no longer "not implemented") and the tools-list budget test.

## Acceptance criteria
P1
- [ ] AC1 — Overview tab shows a "Blast radius" block.
- [ ] AC2 — Summary: changed symbols, callers, endpoints, crons counts.
- [ ] AC3 — Each changed symbol lists callers as `file:line` and, under them, dependent endpoints.
- [ ] AC4 — On a PR changing a shared helper: ≥ 2 real callers and ≥ 1 HTTP endpoint.
- [ ] AC5 — Clicking `file:line` opens that exact line on GitHub.
- [ ] AC6 — No callers → clear text; incomplete index → separate badge with the reason.
- [ ] AC7 — MCP `get_blast_radius` returns the same map as the UI block.
P2
- [ ] AC8 — Logs show a read of the existing index (no re-parse / graph rebuild) during the request.
- [ ] AC9 — Route response passes `BlastRadius.parse`.
- [ ] AC10 — Unit test for the flat `callers` → grouped `downstream` mapping.
- [ ] AC11 — No LLM call on the request path.
- [ ] AC12 — The declaring file never appears among its own symbol's callers.
- [ ] AC13 — Limits come from `repo-intel/constants.ts`, not the component.
- [ ] AC14 — `degraded` + `reason` reach the UI.
- [ ] AC15 — MCP tool follows the lab rules (description, schema, concise output, useful unknown-PR error, `readOnlyHint: true`).
P3 (in scope)
- [ ] AC16 — Symbols collapse/expand; sorted by rank; crons separate from endpoints; Resync button on degraded; labels from `blast.json`.
- [ ] AC17 — Tree / Graph switch next to the summary; Graph draws changed symbols → callers → endpoints/crons as inline SVG with a legend; long labels are shortened with the full text as a tooltip (added 2026-10-14).

## Out of scope
Prior PRs block (needs new GitHub data), any LLM summary.
