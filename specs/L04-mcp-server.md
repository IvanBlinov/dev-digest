# DevDigest MCP server (local, stdio)

## Goal
From Claude Code (or any MCP client) a developer can list DevDigest review agents, start an AI
review of an imported pull request, poll for its findings, and read a repo's extracted
conventions — naming the PR as `owner/name` + PR number. Reviews run inside the already-running
DevDigest API process, so the web UI shows them live. A fifth tool, `get_blast_radius`, is a
registered stub whose input contract is fixed for the L04 Blast Radius feature.

## Scope
- In: a new standalone package `mcp/` (npm, `tsx`, source-only) exposing five tools over **stdio**;
  a thin adapter over the HTTP API (default `http://localhost:3001`, env `DEVDIGEST_API_URL`);
  project-scope registration in root `.mcp.json`; CI workflow; docs.
- Out: HTTP/SSE transport and auth; MCP resources, prompts and `resource_link`; accept/dismiss
  tools; triggering conventions extraction; the real blast-radius implementation; any new server
  endpoint, DB change or shared-contract change.

## Design decisions
- **Thin adapter, no DB.** `mcp/` talks only to the HTTP API; no business logic is duplicated and
  the in-memory run bus stays in the API process.
- **Onion layering** (by analogy with `server/`, see `.claude/skills/onion-architecture`):
  `tools/` (transport: validate → one service call → present/map errors) → `services/`
  (application: PR resolution cache, orchestration; typed results, no text) → `domain/` (pure:
  matching, run outcome, findings selection, domain errors). `api/` is the edge adapter behind the
  `DevDigestApi` port; `presenters/` render text on the transport side; `create-server.ts` is the
  composition root. Enforced by a layering guard test.
- **Human identifiers.** Tools take `repo: "owner/name"` + `pr_number`; the server resolves them to
  internal UUIDs via `GET /repos` and `GET /repos/:id/pulls` (cached 10 min, because the latter
  syncs from GitHub). Ids needed for follow-up calls (`run_id`) are returned inline.
- **Async runs.** `run_review` returns `run_id`s immediately with status `running`;
  `get_findings` reports status or findings. A running/failed/cancelled run is a successful poll
  (`isError: false`); `isError` is reserved for calls that cannot be answered.
- **Startup token budget** (Claude Code Tool Search loads only tool names + server instructions):
  short trigger-style instructions, verb-first snake_case names, 1–3 sentence descriptions with
  keywords first, compact strict input schemas, no `outputSchema`, no `_meta` / `alwaysLoad`.
  The budget is a test gate.
- **Response efficiency.** `response_format: concise | detailed` (default concise), severity
  filter, `limit`/`offset` pagination with a "N more → offset=…" hint, hard cap 20,000 chars per
  response, field whitelists (agent `system_prompt` is never emitted).
- **Errors.** Tool execution errors are `isError: true` with an actionable next step (start
  `./scripts/dev.sh`, wait for rate limit, add the repo in the UI…); no stack traces on stdout.
- **Safety.** Finding/convention text is untrusted LLM output and is fenced as data. stdout is
  reserved for JSON-RPC; all logs go to stderr. Annotations: get/list tools `readOnlyHint`;
  `run_review` `readOnlyHint: false`, `openWorldHint: true` (spends LLM tokens).

## Contracts
No change to `@devdigest/shared`, HTTP routes or the DB. `mcp/` consumes shared types with
`import type` only.

New MCP tool contracts (mcp-local zod input schemas):

| Tool | Purpose | Input |
|---|---|---|
| `list_agents` | Agents: name, enabled, model, focus | none (`additionalProperties: false`) |
| `run_review` | Start an async review; returns `run_id`s | `repo`, `pr_number`, `agent?` (name or id; omit = all enabled) |
| `get_findings` | Run status, or findings sorted by severity | `repo`, `pr_number`, `run_id?`, `severity_min` (default SUGGESTION), `limit` (1–50, default 20), `offset`, `response_format` |
| `get_conventions` | Extracted conventions; never starts extraction | `repo`, `limit` (1–100, default 30), `response_format` |
| `get_blast_radius` | Stub: always `isError` "not implemented yet", no API call | `repo`, `pr_number`, `file?` |

API endpoints used: `GET /agents`, `GET /repos`, `GET /repos/:id/pulls`,
`POST /pulls/:id/review`, `GET /pulls/:id/runs`, `GET /pulls/:id/reviews`,
`GET /repos/:id/conventions`.

## Per-package work
- mcp (new): config, stderr logger, `DevDigestApi` port + HTTP client, domain (matching, run
  outcome, findings selection, errors), services (PR resolver, agents, reviews, conventions),
  presenters, tool registry with instructions and error mapper, five thin tool handlers, stdio entry; vitest unit +
  in-memory MCP client tests, token-budget test, stdio test, optional smoke test against the
  seeded stack.
- root: `.mcp.json`, `.github/workflows/mcp.yml`, `.claude` hook/skill routing for `mcp/`,
  AGENTS.md / TESTING.md / README.md rows.
- server / client / reviewer-core / e2e: none.

## Acceptance criteria
- [ ] AC1 — `mcp/` installs standalone (npm, own lockfile); `npm run typecheck` and `npm test` pass with no network, DB or API.
- [ ] AC2 — `tools/list` returns exactly the five tools, each with a title, the annotations above, and a root `type: object` input schema without root `anyOf`/`oneOf`.
- [ ] AC3 — Budget gate: instructions ≤ 600 chars, each description ≤ 350 chars, `JSON.stringify(tools)` ≤ 7,000 chars.
- [ ] AC4 — `run_review` resolves repo + PR, POSTs `{agentId}` or `{all:true}`, returns `run_id`s at once with status `running`.
- [ ] AC5 — `get_findings` reports run status, or findings sorted by severity, filtered by `severity_min`, paginated with a next-offset hint, concise by default, ≤ 20,000 chars.
- [ ] AC6 — `get_conventions` only issues `GET /repos/:id/conventions`.
- [ ] AC7 — `get_blast_radius` returns `isError: true` "not implemented yet" and makes no API call.
- [ ] AC8 — API unreachable, timeout, 404, 429 and unknown repo/PR/agent come back as `isError: true` with an actionable message and no stack trace.
- [ ] AC9 — stdout carries only JSON-RPC (stdio round-trip test; no `console.log` in `src/`).
- [ ] AC10 — Root `.mcp.json` registers the server and its exact command answers `tools/list`; README documents Claude Code, MCP Inspector and `/context`.
- [ ] AC11 (needs `./scripts/dev.sh`) — smoke test runs `list_agents` + `get_findings` against seeded `acme/payments-api#482` (never `run_review`).
- [ ] AC12 — Layering guard test fails on inward-rule violations (tools calling `api.*`, domain doing I/O or reading the clock, services building text or importing the SDK, `HttpDevDigestApi` constructed outside `create-server.ts`).

## Links
- Plan: [specs/plans/2026-10-13-mcp-server.md](plans/2026-10-13-mcp-server.md)
- Reviews API: `server/src/modules/reviews/routes.ts`, `server/src/modules/reviews/service.ts`
- PR sync side effects: `server/src/modules/pulls/routes.ts`
- Conventions API: `server/src/modules/conventions/routes.ts`
- Best practices: MCP spec 2025-11-25 (tools), Anthropic "Writing effective tools for agents", Claude Code MCP docs (tool search, output limits)
