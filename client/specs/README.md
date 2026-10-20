# client/specs

Screen and feature specs scoped to the web app. Cross-package features go to
[../../specs/](../../specs/README.md).

Naming: `LNN-short-name.md` (course lesson prefix) or `XX-short-name.md`.

## Template

Every spec uses the shared template from the [spec-writing skill](../../.claude/skills/spec-writing/SKILL.md)
(`Spec ID: SPEC-NN`, `Status: draft | approved | implemented`, EARS acceptance criteria, edge cases,
NFRs, inputs and provenance, untrusted inputs, open questions). Write new specs with the
[`spec-writer`](../../.claude/agents/spec-writer.md) agent. Older specs written before 2026-10-14
keep their original shape and count as approved.

## What a client spec must pin down

- Route(s) under `src/app/...` touched or added.
- Data: hooks in `src/lib/hooks/`, API endpoints, contracts from `@devdigest/shared`.
- UI states: loading / empty / error / degraded / success, and narrow-screen behaviour.
- Strings: keys in `messages/en/<feature>.json`.
- Whether a main journey changes (then an e2e flow in `../../e2e/specs/`).
