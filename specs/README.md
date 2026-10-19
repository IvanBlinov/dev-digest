# Cross-module specs

Specs for features that touch **more than one package** (e.g. a new API route plus a UI screen
plus an engine prompt slot). Single-package features live in that package's `specs/`.

## File naming

`specs/LNN-short-name.md` — prefix with the course lesson (`L01`…`L08`) when applicable,
otherwise `XX`.

## Template

Every spec uses the shared template from the [spec-writing skill](../.claude/skills/spec-writing/SKILL.md)
(`Spec ID: SPEC-NN`, `Status: draft | approved | implemented`, EARS acceptance criteria, edge cases,
NFRs, inputs and provenance, untrusted inputs, open questions). Write new specs with the
[`spec-writer`](../.claude/agents/spec-writer.md) agent. Older specs written before 2026-10-14
keep their original shape and count as approved.

## What a cross-module spec must pin down

- Which package owns each part: server route/service, `@devdigest/shared` contract, client
  hook/component, reviewer-core prompt, MCP tool, e2e flow.
- The contract between them and what each side does when the other is down or degraded.
