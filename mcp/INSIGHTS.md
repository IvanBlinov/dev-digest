# Insights - mcp

Dated entries, newest first. Format and rubrics: [../.claude/skills/engineering-insights/SKILL.md](../.claude/skills/engineering-insights/SKILL.md).

## 2026-10-13 - [Pitfall] The `zod` path alias must point at `index.d.cts`, not the package directory
Symptom: `tsc` ran for minutes at 4 GB and then reported `ZodNumber is not assignable to ZodTypeAny` / `Type instantiation is excessively deep` in `registerTool(...)`.
Cause: `"zod": ["./node_modules/zod"]` resolves `index.d.ts`, while the SDK resolves zod through package `exports` to `index.d.cts`: two distinct zod type copies.
Rule: keep the alias on the exact file the `exports` map names (`index.d.cts`); do not add `zod/*` aliases. Run typecheck with a time limit after touching tsconfig.
Proof: `mcp/tsconfig.json:24`

## 2026-10-13 - [Non-obvious behaviour] Not every MCP client expands `${VAR:-default}` from `.mcp.json`
Symptom: the MCP Inspector CLI started the server with `DEVDIGEST_API_URL` set to the literal `${DEVDIGEST_API_URL:-http://localhost:3001}`, so config validation failed and the session closed.
Cause: only Claude Code expands that syntax; other clients pass the string through. The Inspector's own CLI also mis-parses `npm --prefix mcp ...` after `--cli`, so verify with `--config .mcp.json --server devdigest` instead.
Rule: `loadConfig` treats an unexpanded `${...}` value as unset; verify the registered command with `npx @modelcontextprotocol/inspector --cli --config .mcp.json --server devdigest --method tools/list`.
Proof: `mcp/src/config.ts:21`, `.mcp.json:1`

## 2026-10-13 - [Non-obvious behaviour] A read-looking `GET /repos/:id/pulls` syncs GitHub and writes rows
Symptom: listing PRs for a repo is slow and can upsert `pull_requests` rows even though it is a GET.
Cause: the handler calls GitHub (`listPullRequests`) and inserts/updates rows on every call when a token is configured.
Rule: never call it in a polling loop; `PrResolver` caches repo/PR resolution for 10 min (`PR_CACHE_TTL_MS`) and refetches once on a miss.
Proof: `server/src/modules/pulls/routes.ts:44`, `mcp/src/services/pr-resolver.ts:7`

## 2026-10-13 - [Non-obvious behaviour] The review row is persisted before the run is marked `done`
Symptom: a `done` run could in theory have no review yet.
Cause: `insertReview` runs before `completeAgentRun(status: 'done')`, so "done" implies the review exists; the gap only appears on partial failure.
Rule: `classifyRun` reports `finishing` (not an error) when a done run has no review with that `run_id`.
Proof: `server/src/modules/reviews/run-executor.ts:351`, `server/src/modules/reviews/run-executor.ts:377`, `mcp/src/domain/findings.ts:64`
