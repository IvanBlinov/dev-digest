# @devdigest/reviewer-core (reviewer-core/)

Pure review engine: **diff → prompt → LLM → grounded findings**. No database, GitHub, filesystem
or network except one injected `LLMProvider`. Pipeline diagram and public API: [README.md](README.md).

## Read first

- [README.md](README.md) — pipeline, public API, optional prompt slots per lesson
- [docs/](docs/README.md) — prompt design and grounding rationale
- [specs/](specs/README.md) — engine feature specs
- [INSIGHTS.md](INSIGHTS.md) — pitfalls; read before touching `prompt.ts` or `grounding.ts`
- [../docs/agent-prompts/README.md](../docs/agent-prompts/README.md) — how agent system prompts are written
- **Insights (always on):** record findings per [../.claude/skills/engineering-insights/SKILL.md](../.claude/skills/engineering-insights/SKILL.md) into [INSIGHTS.md](INSIGHTS.md) as you go, with date + `file:line` proof.
- Parent: [../CLAUDE.md](../CLAUDE.md)

## Layout

- `src/prompt.ts` — `assemblePrompt`, `wrapUntrusted`, `INJECTION_GUARD`.
- `src/grounding.ts` — `groundFindings`, `groundingSummary`: mechanical citation gate against the diff.
- `src/llm/structured.ts` — Zod → JSON Schema, `extractJson`, `parseWithRepair`. `src/llm/openrouter.ts` — provider.
- `src/review/run.ts` — orchestrates a single-pass run; `src/review/reduce.ts` — map-reduce path (L06+).
- `src/output/to-review.ts` — CI payload helper.
- `src/index.ts` — the public surface. Contracts (`Review`, `Finding`, `Verdict`) come from `@devdigest/shared`.

## Commands

```sh
npm test            # vitest, hermetic, stubbed LLMProvider — no keys, no network
npm run typecheck   # also the "build": the package never emits JS
```

## Conventions

- **Purity is the contract.** Everything is a function of its inputs plus the injected provider. No `process.env`, no `fs`, no `fetch` outside `src/llm/`.
- **`INJECTION_GUARD` is appended to every system prompt** by `assemblePrompt`. Untrusted content (diff, PR body, comments) is fenced with `wrapUntrusted`. No keyword denylists.
- **Grounding is mandatory.** A finding without a real diff line is dropped; the score is recomputed from survivors. The model's self-reported score is ignored.
- **Optional slots stay optional.** `skills`, `memory`, `specs`, `callers` are omitted in the starter; `assemblePrompt` must leave those sections out cleanly when absent.
- **Tests stub the provider.** Every test passes a fake `LLMProvider`; assert on the assembled prompt and on grounded output.

## Boundaries

- Consumed by `server/` as TypeScript **source** via tsconfig alias. Keep `src/index.ts` exports stable; adding is fine, renaming breaks the server.
- No persistence, no HTTP routes, no GitHub calls here. Those live in `server/`.
- Do not import from `../server/` or `../client/`.

## Workflow

Spec in `specs/` → test with a stubbed provider → change → `npm run typecheck` →
run `cd ../server && pnpm typecheck` because the server type-checks against this source.
