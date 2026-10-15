# Development Plan: L04 Blast Radius

**Spec:** [specs/L04-blast-radius.md](../L04-blast-radius.md) · **Base commit:** d4d6a52 (branch `feat/l04-blast-radius`)
**Packages:** server, client, mcp, e2e · **Size:** L (S1–S4, S6–S11; S5 folded into S6)

**Approved decisions (2026-10-13):** scope P1 + P2 + cheap P3 (collapsible tree, rank sort, crons separate, Resync button, labels from `blast.json`; no Graph view, no Prior PRs); optional `degraded` + `reason` on `BlastRadius`; branch off `feat/l04-mcp-server`. Open questions left at their defaults: Resync only shows "resync started" (no polling/refetch on job completion); the uncommitted `packageManager` line in `mcp/package.json` is **not** touched and **not** staged.

## Goal
The Overview tab of a PR shows a "Blast radius" block with these parts:
- the symbols declared in the changed files;
- their callers, as `file:line` links to GitHub;
- the endpoints and crons that depend on those callers.

A degraded index gets its own badge with the reason and a Resync button. The MCP tool `get_blast_radius` returns the same map as text. Everything is read from the existing repo-intel index: no re-parse, no LLM.

## Acceptance criteria
- AC1 — The Overview tab renders a "Blast radius" block → `OverviewTab.test.tsx` (S8), e2e `10-blast-radius.flow.json` (S11)
- AC2 — The summary row shows symbols / callers / endpoints / crons counts → `BlastRadiusBlock.test.tsx` (S7), `blast-helpers.test.ts` summary case (S2)
- AC3 — Each symbol lists its callers as `file:line`, with endpoints under them → S2 grouping cases, S7 render case
- AC4 — A shared-helper PR shows ≥2 callers and ≥1 endpoint → S2 fixture case + manual check on an indexed real repo (Verification matrix)
- AC5 — Each `file:line` is an anchor to `githubBlobUrl(repo, headSha, file, line)` with `target=_blank` → S7
- AC6 — No callers → `noDownstream` text; a degraded index → a distinct reason badge → S7
- AC7 — The MCP output has the same map (summary, callers, endpoints/crons, degraded reason) → `mcp/test/tools/get-blast-radius.test.ts` (S10)
- AC8 — An info log records the index read (source, counts, degraded) → S3 service test
- AC9 — The response passes `BlastRadius.parse` → S3 (route `response` schema + test)
- AC10 — The flat `callers` → grouped `downstream` mapping has a unit test → S2
- AC11 — No LLM call on the request path → S3 asserts `MockLLMProvider.calls` is empty
- AC12 — The declaring file is never among its own symbol's callers → S2 case
- AC13 — No limit constants in client or MCP; caps live only in `repo-intel/constants.ts` → S7/S9 review, grep in the matrix
- AC14 — `degraded` + `reason` reach the UI → S1 contract, S2 passthrough, S7 badge
- AC15 — The MCP tool meets the lab rules → S10 + `test/guards/tools-list.test.ts`
- AC16 — Symbols collapse/expand and are sorted by rank; crons are separate; Resync button; labels from `blast.json` → S2 ordering, S7

## Key constraints
| Source (file:line) | Rule / insight | Effect on this plan |
|---|---|---|
| `server/src/modules/repo-intel/types.ts:74-87` | `BlastResult`; `factsByFile` only exists on the persistent path | S2 falls back to empty endpoints/crons per group |
| `server/src/modules/repo-intel/service.ts:220-304` | The ripgrep fallback always returns `degraded:true, reason:'no_data'`, `rank:0` | e2e/seed data is degraded `no_data` (S11 relies on it) |
| `server/src/modules/repo-intel/service.ts:388` | `callers.slice(0, MAX_CALLERS_PER_SYMBOL)` caps the total, not per symbol | Not fixed here (Risks). S2 must not re-cap |
| `server/src/modules/smart-diff/service.ts:17-21` | Template: `ReviewRepository.getPull/getPrFiles`, `NotFoundError` | S3 copies it; no new repository |
| `server/src/modules/intent/service.ts:57-61` | `PinoLike` logger param; the route passes `req.log` | S3 logging for AC8; counts only, no repo text in logs |
| `client/src/lib/hooks/repo-intel.ts:43-52` | `useResyncRepoIntel` already exists | S7 reuses it; no new resync hook |
| `client/INSIGHTS.md:17` | `SectionLabel` uppercases via CSS | S11 waits on badge/summary text, not on the heading |
| `client/INSIGHTS.md:51` | Mutation errors are toasted globally | S7 adds no local resync error UI |
| `client/INSIGHTS.md:62` | A value import from `@devdigest/shared` breaks `next build` | The client uses `import type` only; reason labels come from i18n keys, not the zod enum |
| `mcp/INSIGHTS.md:5` | Every interpolated string goes through `oneLine` with a cap; each presenter test has a newline-injection case | S9 |

## Constraints hit
- `vendor/shared` mirror: S1 edits the server copy, then `cp` to the client and checks with `diff`. MCP aliases the server copy (`mcp/tsconfig.json:22`), so it needs no copy of its own.
- `mcp/package.json` has an uncommitted `packageManager: pnpm@…` line. Do **not** stage it.
- No migration, no new dependency, no lock-file change, no change to `reviewer-core`.

## Contract & data changes
| Contract / table | Before → after | Optional/nullable choice | Consumers to update |
|---|---|---|---|
| `BlastRadius` (`brief.ts:89`) | `{changed_symbols, downstream, summary}` → adds `degraded?: boolean`, `reason?: BlastDegradedReason` | `.optional()` (not stored jsonb; omitting the keys stays valid) | blast route/service (S3), client hook (S6), MCP port/domain (S9) |
| new `BlastDegradedReason` | — → `z.enum(['flag_off','index_failed','index_partial','repo_too_large','no_data'])` | — | server helper (S2); same literals as `DegradedReason` (`repo-intel/types.ts:27`) |

## Steps

### S1 — Contract: degraded/reason on BlastRadius  [server+client · contracts]
- **Skills:** shared-contracts, zod, test-strategy
- **Files:** modify `server/src/vendor/shared/contracts/brief.ts:89` (add `BlastDegradedReason` above `BlastRadius`; add the two optional keys) · copy to `client/src/vendor/shared/contracts/brief.ts` · modify `server/test/contracts.test.ts` (new `describe('BlastRadius')`)
- **Test first:** a legacy object without `degraded` → parses; `{degraded:true, reason:'index_partial'}` → parses; `reason:'bogus'` → fails. Fails before the change (missing export).
- **Implement:** add the enum + optional fields; touch nothing else in the file.
- **Verify:** `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts` (empty) · `cd server && pnpm exec vitest run test/contracts.test.ts && pnpm typecheck` · `cd client && pnpm typecheck` · `cd mcp && npm run typecheck`
- **Done when:** contract part of AC14

### S2 — Pure mapping helper  [server · domain helpers]
- **Skills:** onion-architecture, typescript-expert, test-strategy
- **Files:** create `server/src/modules/blast/helpers.ts` · create `server/test/blast-helpers.test.ts`
- **Test first** (cases):
  - (a) Two `viaSymbol`s → two `downstream` groups; callers map to `{name: symbol, file, line}`.
  - (b) `endpoints_affected` / `crons_affected` = deduplicated union of `factsByFile` over the group's caller files, kept separate.
  - (c) `factsByFile` absent → `[]` for both.
  - (d) Order by max caller rank desc, then symbol name asc. Callers inside a group: rank desc, then file, then line.
  - (e) A changed symbol with no callers stays in `changed_symbols` and gets no `downstream` entry.
  - (f) A caller row whose file is the declaring file of that `viaSymbol` is dropped (AC12).
  - (g) `degraded`/`reason` pass through, and are omitted when absent.
  - (h) `summary` is deterministic from counts, e.g. `"2 changed symbols, 3 callers, 1 endpoint, 0 crons"`.
  - (i) Fixture "shared helper with 2 callers in route files" → ≥2 callers and ≥1 endpoint (AC4).
  - (j) The output passes `BlastRadius.parse`.
- **Implement:** `toBlastRadius(result: BlastResult): BlastRadius` + `blastSummary(counts)`. `import type` from `../repo-intel/types.js`. No limit constants, no slicing (AC13), no mutation. Pattern: `server/src/modules/smart-diff/helpers.ts`.
- **Verify:** `cd server && pnpm exec vitest run test/blast-helpers.test.ts && pnpm typecheck`
- **Done when:** AC10, AC12, mapping part of AC3/AC4/AC16

### S3 — Service + route + registration  [server · service, route]
- **Skills:** onion-architecture, fastify-best-practices, security, test-strategy
- **Files:** create `server/src/modules/blast/service.ts`, `server/src/modules/blast/routes.ts` · modify `server/src/modules/index.ts` (import + `blast` entry) · create `server/test/blast.it.test.ts`
- **Test first:** copy the setup from `server/test/smart-diff.it.test.ts:16-44` (seeded PR #482, `buildApp` with mocks) and add `overrides.repoIntel = { getBlastRadius: vi.fn(async () => FIXTURE) } as unknown as RepoIntel`. Cases:
  - (a) `GET /pulls/:id/blast` → 200; the body passes `BlastRadius.parse` (AC9); `getBlastRadius` is called exactly once with `(pull.repoId, <PR #482 pr_files paths>)`.
  - (b) A degraded fixture → `degraded:true, reason:'no_data'` in the body.
  - (c) A random uuid → 404 with the error envelope.
  - (d) `llm.calls` is empty (AC11).
  - (e) `new BlastService(app.container).get(ws, prId, captureLogger)` → one info entry `'blast: read repo-intel index'` with `{prId, files, symbols, callers, degraded, reason}` and no symbol names or paths (AC8).
- **Implement:** `BlastService` (constructor `container`, `ReviewRepository(container.db)`). It loads the pull (`NotFoundError`), gets the paths from `getPrFiles`, calls `container.repoIntel.getBlastRadius` once, logs via an optional `PinoLike`, and returns `toBlastRadius(...)`. The route copies `smart-diff/routes.ts:13-25` with `response: {200: BlastRadius}` and passes `req.log`. No `container.db` in routes.
- **Verify:** `cd server && pnpm exec vitest run test/blast.it.test.ts && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'`
- **Done when:** AC8, AC9, AC11

### S4 — i18n keys  [client · messages]
- **Skills:** frontend-architecture
- **Files:** modify `client/messages/en/blast.json` (keep the existing keys). Add: `title` ("Blast radius"), `summaryAria`, `degraded.badge` ("Index incomplete: {reason}"), `degraded.reason.{flag_off,index_failed,index_partial,repo_too_large,no_data}`, `resync`, `resyncing`, `resyncStarted`, `endpointsLabel`, `cronsLabel`, `expand`, `collapse`, `loadError`, `noRepoLink`.
- **Verify:** `cd client && pnpm typecheck`
- **Done when:** labels for AC16

### S6 — Data hook  [client · hook]
- **Skills:** frontend-architecture, react-best-practices, react-testing-library, test-strategy
- **Files:** create `client/src/lib/hooks/blast.ts`, `client/src/lib/hooks/blast.test.tsx` · modify `client/src/lib/hooks/index.ts` (`export * from "./blast";`)
- **Test first:** pattern `client/src/lib/hooks/smart-diff.test.tsx`. GETs `/pulls/p1/blast` and returns the data; disabled when `prId` is null.
- **Implement:** `blastKey(prId)`, `useBlastRadius(prId)`, a copy of `client/src/lib/hooks/smart-diff.ts:10-17`. `import type { BlastRadius }`.
- **Verify:** `cd client && pnpm exec vitest run src/lib/hooks/blast.test.tsx && pnpm typecheck`

### S7 — BlastRadiusBlock component  [client · component]
- **Skills:** frontend-architecture, react-best-practices, react-testing-library, test-strategy, security
- **Files:** create `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/BlastRadiusBlock/{BlastRadiusBlock.tsx,index.ts,styles.ts,helpers.ts,BlastRadiusBlock.test.tsx}` (optional child `_components/SymbolImpact/` if over ~200 lines)
- **Test first:** mock `@/lib/hooks/blast` and `@/lib/hooks/repo-intel`; `NextIntlClientProvider` with `{ blast: messages }`; pattern `IntentCard.test.tsx`. Cases:
  - (a) The summary shows 4 counts with the `stat.*` labels (AC2).
  - (b) Symbols render in server order; the first is expanded and the rest collapsed; a click toggles `aria-expanded` (AC16).
  - (c) The caller link text is `file:line` with `href === githubBlobUrl('acme/payments-api','abc','src/a.ts',12)`, `target="_blank"`, and `rel` containing `noopener` (AC5).
  - (d) Endpoint chips and cron chips sit in separate labelled groups (AC3/AC16).
  - (e) No downstream → `noDownstream` text (AC6).
  - (f) `degraded:true, reason:'index_partial'` → a badge with the reason label; Resync calls `mutate` (AC6/AC14/AC16).
  - (g) Without `repoFullName`/`headSha`, `file:line` is plain text.
  - (h) Loading → Skeleton; error → `ErrorState` with retry.
- **Implement:** props `{prId, repoId, repoFullName, headSha}`. `helpers.ts` has `blastCounts(radius)`: symbols = `changed_symbols.length`, callers = Σ callers, endpoints/crons = unique unions. Use `@devdigest/ui` primitives. All strings via `useTranslations("blast")`. No numeric caps. Symbol and path text is rendered as plain React text.
- **Verify:** `cd client && pnpm exec vitest run "src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab" && pnpm typecheck`
- **Done when:** AC2, AC3, AC5, AC6, AC14, AC16

### S8 — Wire into OverviewTab and page  [client · component, page]
- **Skills:** frontend-architecture, react-best-practices, react-testing-library, test-strategy
- **Files:** modify `.../_components/OverviewTab/OverviewTab.tsx` (new props; render `<BlastRadiusBlock>` after the description) · modify `.../OverviewTab/OverviewTab.test.tsx` · modify `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` (pass `prId`, `repoId`, `repoFullName`, `headSha={pr.head_sha}`)
- **Test first:** stub `./_components/BlastRadiusBlock` and check that the block renders with the passed `prId` (AC1). The existing "renders nothing without a body" test becomes "no description without a body, blast block still renders". This is an intended deviation.
- **Verify:** `cd client && pnpm exec vitest run "src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab" && pnpm typecheck && pnpm test`
- **Done when:** AC1

### S9 — MCP edge + domain + service + presenter  [mcp]
- **Skills:** typescript-expert, zod, security, test-strategy (read `mcp/AGENTS.md` Boundaries)
- **Files:**
  - modify `mcp/src/api/port.ts` (`getBlastRadius(prId): Promise<BlastRadius>`) and `mcp/src/api/http-client.ts` (`GET /pulls/${encodeURIComponent(prId)}/blast`)
  - modify `mcp/test/mocks.ts` (`blast` fixtures + method + `blastRadius()` builder)
  - create `mcp/src/domain/blast.ts`, `mcp/src/services/blast-service.ts`, `mcp/src/presenters/blast.ts`
  - tests: `mcp/test/api/http-client.test.ts` (+1 case), `mcp/test/domain/blast.test.ts`, `mcp/test/services/blast-service.test.ts`, `mcp/test/presenters/blast.test.ts`
- **Test first:**
  - http-client: `GET {apiUrl}/pulls/pr%2F1/blast`.
  - domain: `blastView(radius, file?)`. Without `file`, everything passes through. With `file`, only that file's symbols and their downstream remain. A file with no symbols → `fileFilterMiss: true`.
  - service: `PrResolver.resolve` → one `getBlastRadius(pr.id)`; an unknown repo → `RepoNotFoundError`.
  - presenter, output order:
    1. the summary line;
    2. per symbol, `name (file)` + callers as `file:line`;
    3. separate `endpoints:` / `crons:` lines;
    4. `Index incomplete: <reason>` when degraded.
  - presenter guards: newline injection is collapsed (`oneLine`); output ≤ `MAX_RESPONSE_CHARS` with a "more" hint via `capItems`.
- **Implement:** follow `services/conventions-service.ts` (typed view, never text) and `presenters/conventions.ts` (caps from `presenters/text.ts`). `import type` from `@devdigest/shared` only. `reason` is an enum and may be printed raw.
- **Verify:** `cd mcp && npm run typecheck && npm test`

### S10 — MCP tool replaces the stub + spec update  [mcp · tools, docs]
- **Skills:** typescript-expert, zod, security, test-strategy
- **Files:**
  - rewrite `mcp/src/tools/get-blast-radius.ts` (pattern `tools/get-conventions.ts`)
  - modify `mcp/src/tools/registry.ts` (`blast: BlastService`; `handler(services)`)
  - modify `mcp/src/create-server.ts` (`new BlastService(api, resolver)`)
  - rewrite `mcp/test/tools/get-blast-radius.test.ts`
  - re-run `mcp/test/guards/tools-list.test.ts`
  - modify `specs/L04-mcp-server.md` (AC7 → real tool) and `mcp/README.md` / `mcp/AGENTS.md` if they say "not implemented"
- **Test first** (via `connect(api)`):
  - (a) Seeded data → not `isError`; the text contains the summary, `src/a.ts:12` and `GET /refunds`.
  - (b) Unknown PR → `isError` "import/sync it in the UI".
  - (c) Degraded → the text contains `no_data`.
  - (d) The `file` filter works.
  - (e) Exactly one `getBlastRadius` call.
- **Implement:** title "Get PR blast radius". Description ≤350 chars and says when to call it ("before approving or editing a PR: what else can this diff break — callers file:line, endpoints, crons"). `readOnlyHint: true`. Budget limits (600/350/7000) stay unchanged; shorten the text if needed. Drop `NOT_IMPLEMENTED_TEXT`.
- **Verify:** `cd mcp && npm run typecheck && npm test && npx vitest run test/guards/tools-list.test.ts --reporter=verbose`
- **Done when:** AC7, AC15

### S11 — e2e flow  [e2e]
- **Skills:** e2e-flows, test-strategy (read `e2e/AGENTS.md`)
- **Files:** create `e2e/specs/10-blast-radius.flow.json` (copy steps 1–5 of `e2e/specs/08-pr-intent.flow.json`, then wait for the summary labels and the degraded badge text "Index incomplete")
- **Implement:** read-only; no Resync click; no matching on the uppercased heading.
- **Verify:** `cd e2e && npm run typecheck && npm run e2e:hermetic`. If the stack can't run, report "not run: <reason>".
- **Done when:** AC1/AC6 in a browser

## Verification matrix
| Package | Commands |
|---|---|
| server | `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts' && pnpm exec vitest run test/blast.it.test.ts` |
| client | `cd client && pnpm typecheck && pnpm test` |
| mcp | `cd mcp && npm run typecheck && npm test` |
| e2e | `cd e2e && npm run typecheck && npm run e2e:hermetic` |
| contracts | `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts` (empty) |
| AC13 | `rg -n "MAX_CALLERS\|BFS_DEPTH\|slice\(0" client/src/app mcp/src/presenters/blast.ts server/src/modules/blast` (no limit hits) |
| AC4 manual | With `./scripts/dev.sh` and a fully indexed real repo, open a PR that changes a shared helper → ≥2 callers, ≥1 endpoint; the log `blast: read repo-intel index` shows `degraded:false` |

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| The facade caps callers globally (`service.ts:388`), so a heavy symbol can starve others | M | Out of scope; record in `server/INSIGHTS.md`; S2 does no extra capping |
| `viaSymbol` is a name, so same-name symbols in different files merge | L | Group by name; both stay in `changed_symbols`; noted |
| Seed/e2e never reaches the persistent path, so AC4 isn't automated end to end | H | S2 fixture (i) + manual matrix row |
| The facade only emits `no_data` today | M | Contract/i18n carry all five; the badge test uses `index_partial` |
| The OverviewTab "renders nothing" test changes meaning | H | S8 states it as an intended deviation |
| tools/list budget exceeded | L | Shorten the text; limits unchanged |
| Stray `packageManager` line committed | M | Never stage `mcp/package.json` |

## Out of scope
- Graph view, Prior PRs block, LLM summary.
- Fixing the facade's per-symbol cap or its name-keyed grouping.
- Security notes: the new GET falls under the global rate limit; repo-derived strings render as plain text in the client and go through `oneLine` in MCP; Resync reuses the existing `POST /repos/:id/resync`.
- Architecture note: `BlastService` reuses `ReviewRepository` (precedent `smart-diff/service.ts:12`).

## Revision 2026-10-14 (after manual check on PR #9)
Found in the browser: the block sat full-width under the description (the reference puts it beside Intent), and client PRs showed 0 callers.
Root cause of the empty data: the references resolver (`server/src/modules/repo-intel/repository.ts` `resolveReferences`) needs a direct `file_edges` edge from the importer to the file that declares the symbol. Client components are imported through `index.ts` barrels (`page.tsx → OverviewTab/index.ts → OverviewTab.tsx`), so 95% of client references stay `decl_file = NULL`. Approved by the user: fix the resolver and resync; match the reference visually.

### R1 — Resolver follows one barrel hop  [server · repo-intel repository]
- **Skills:** onion-architecture, drizzle-orm-patterns, test-strategy
- **Test first:** a DB-backed `.it.test.ts` with three files:
  - `page.tsx` imports `./Comp` (edge to `Comp/index.ts`);
  - `Comp/index.ts` re-exports from `./Comp` (edge to `Comp/Comp.tsx`);
  - `Comp/Comp.tsx` exports `Comp`.
  - After `resolveReferences`, the `page.tsx → Comp` reference has `decl_file = Comp/Comp.tsx`.
  - A direct edge still wins over the barrel hop.
  - Two candidate declarations stay unresolved, as before.
- **Implement:** in the `cand` CTE, add the one-hop path through a barrel target (`index.ts` / `index.tsx`) that has no own export of that name. The uniqueness rule stays unchanged.
- **Then:** `POST /repos/:id/resync` for IvanBlinov/dev-digest; re-check `GET /pulls/:id/blast` for PR #9.

### R2 — Overview layout + reference visuals  [client]
- Overview order: description → a two-column row [IntentCard | BlastRadiusBlock] (wraps to one column on narrow widths). IntentCard stays above the results on the Agent runs tab only.
- Visuals as in the reference: stat icons; symbol row `name()` with a code icon and right-aligned "N callers"; `↳ file:line` caller rows on a tree guide line; blue endpoint chips with a globe icon; amber cron chips with a clock icon. Graph toggle and Prior PRs stay out of scope.
