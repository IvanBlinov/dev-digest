# Architecture review — PR Brief (SPEC-03)

**Plan:** [2026-10-19-l06-pr-brief.md](2026-10-19-l06-pr-brief.md) · **Diff:** d0849d0..90b8304 · **Reviewer:** architecture-reviewer (read-only, fresh context) · **Date:** 2026-10-20

**Verdict:** clean. There are no Critical or Important findings at confidence ≥ 80, so no fix loop was run.

| Rule | Result |
|---|---|
| B1/B2 routes | `modules/brief/routes.ts` imports only `_shared`, its own constants and helpers, and the service. It does not use the container's db, github or llm directly. |
| B3/B4/B14 layering | The repository is the only place that queries the database. `service.ts` has no Fastify import. `helpers.ts` is pure. There is no `process.env` and no adapter construction. |
| Cross-module use | The service calls `IntentService`, `BlastService` and other modules' pure helpers, as planned. `new ReviewRepository(container.db)` matches the existing intent, blast and smart-diff services. |
| LLM adapters | The `retries: 0` option goes through the OpenAI and Anthropic providers and `Container.llm(id, {retries: 0})`, under a separate cache key. Default behaviour is unchanged. |
| B6 prompt building | The brief prompt and token budget live in `reviewer-core/src/brief/`. The server only logs `promptKind: 'brief'`. |
| B7 reviewer-core isolation | It imports only `@devdigest/shared` and its own relative paths. |
| B8 index.ts exports | Additions only. |
| B9/B10 client isolation | The client imports only types from `@devdigest/shared`, and never from the server or reviewer-core. |
| B11 shared mirror | The server and client copies of `brief.ts` and `platform.ts` are identical. |
| B12 fetch | No new `fetch(`. The hook is exported through `hooks/index.ts`. |
| B13 placement | `BriefRefLink`, `RiskAreas` and `ReviewFocus` are route-local under the Overview tab. The `parsePatch` barrel export and the new `IconBtn` `disabled`/`busy` props are additive. |

Security, test quality and plan compliance were outside this review.
