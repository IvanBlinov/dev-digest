# server/specs

Feature specs scoped to the API. Cross-package features go to [../../specs/](../../specs/README.md).

Naming: `LNN-short-name.md` (course lesson prefix) or `XX-short-name.md`.

## Template

Every spec uses the shared template from the [spec-writing skill](../../.claude/skills/spec-writing/SKILL.md)
(`Spec ID: SPEC-NN`, `Status: draft | approved | implemented`, EARS acceptance criteria, edge cases,
NFRs, inputs and provenance, untrusted inputs, open questions). Write new specs with the
[`spec-writer`](../../.claude/agents/spec-writer.md) agent. Older specs written before 2026-10-14
keep their original shape and count as approved.

## What a server spec must pin down

- Routes: method, path, Zod request/response contracts (names in `@devdigest/shared`).
- Data: schema tables touched; whether a migration is required.
- Adapters / ports: new or changed ports and their `Mock<Port>` behaviour.
- Degraded behaviour when an adapter (GitHub, LLM, repo index) is unavailable.
