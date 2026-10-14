# AGENTS.md - mcp (`@devdigest/mcp`)

stdio MCP server: a thin adapter over the DevDigest HTTP API (default `http://localhost:3001`). Lets an
MCP client list agents, start an async review, poll findings and read repo conventions. No DB, no
server imports. Spec: [../specs/L04-mcp-server.md](../specs/L04-mcp-server.md).

## Commands

```sh
cd mcp && npm install
npm run typecheck && npm test      # hermetic, no network/DB/API
npm run test:it                    # smoke test, needs ./scripts/dev.sh running
npm start                          # stdio server (tsx, source only, no build)
npm run inspect                    # MCP Inspector
```

Env (read only in `src/config.ts`): `DEVDIGEST_API_URL` (default `http://localhost:3001`),
`DEVDIGEST_TIMEOUT_MS` (default 15000).

## Boundaries (onion layering, by analogy with `server/`)

| Layer | Path | Role |
|-------|------|------|
| Transport | `src/tools/` | validate (zod) -> ONE service call -> present / map errors. No `api.*` calls |
| Presenters | `src/presenters/` | pure text rendering, size cap, untrusted fencing; import domain types only |
| Application | `src/services/` | PR resolution cache, orchestration; return typed unions, never text |
| Domain | `src/domain/` | pure: matching, run outcome, findings selection, domain errors (data only) |
| Edge | `src/api/` | `DevDigestApi` port, `HttpDevDigestApi`, edge errors |
| Composition root | `src/create-server.ts` | the only place that constructs `HttpDevDigestApi` |
| Test doubles | `test/mocks.ts` | `MockDevDigestApi` + fixture builders |

Dependency rule (inward only; enforced as allowlists for `api`, `domain`, `services`, `presenters`): `tools` -> services, presenters, domain (`domain/errors` values, other domain as `import type`), `api/errors`, SDK ·
`presenters` -> `presenters/*` and domain types · `services` -> `api/port`, domain, shared types · `domain` -> shared types
only · `api/*` -> `api/*`, config (type), shared types. No layer imports `server/`, `client/`, `reviewer-core/`, `e2e/` or `@devdigest/(reviewer-core|ui)`; `domain` and `services` never import `config` or `log`.

Red flags: `api.` inside `tools/`; text built in a service; `Date.now()` / `fetch` / `node:` in
`domain/`; `new HttpDevDigestApi` outside `create-server.ts`. Enforced by `test/guards/layering.test.ts`.

Kept: HTTP only (no DB/server imports), `import type` from `@devdigest/shared` only (values would
need `server/node_modules`), stdout reserved for JSON-RPC (logs via `src/log.ts` to stderr), no
`console.log`. `zod` is pinned `^3.25` to match the server so shared types type-check; the tsconfig `zod` alias must stay on `index.d.cts` (see INSIGHTS.md).

## Do not touch

- `package-lock.json` - changes only as a side effect of an intentional `npm install <pkg>`. npm, not pnpm.
- `CLAUDE.md` is a symlink to this file - edit `AGENTS.md` only.
