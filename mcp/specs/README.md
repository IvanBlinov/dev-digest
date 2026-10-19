# mcp/specs

Feature specs scoped to the stdio MCP server (`@devdigest/mcp`): new or changed tools, their
inputs, output text and errors. Cross-package features go to [../../specs/](../../specs/README.md).

Naming: `LNN-short-name.md` (course lesson prefix) or `XX-short-name.md`.

## Template

Every spec uses the shared template from the [spec-writing skill](../../.claude/skills/spec-writing/SKILL.md)
(`Spec ID: SPEC-NN`, `Status: draft | approved | implemented`, EARS acceptance criteria, edge cases,
NFRs, inputs and provenance, untrusted inputs, open questions). Write new specs with the
[`spec-writer`](../../.claude/agents/spec-writer.md) agent. Older specs written before 2026-10-14
keep their original shape and count as approved.

## What an mcp spec must pin down

- Tool name, title, description (when to call it) and annotations (`readOnlyHint`, …).
- Input schema: fields, types, defaults, limits.
- The HTTP route(s) it calls; it never touches the DB or server code.
- Output text: concise by default, size cap, untrusted strings collapsed/fenced.
- Errors: unknown repo/PR/agent, API down, timeout, rate limit — each with an actionable message.
