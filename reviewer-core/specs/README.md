# reviewer-core/specs

Feature specs scoped to the engine (new prompt slots, grounding changes, output shapes).
Cross-package features go to [../../specs/](../../specs/README.md).

Naming: `LNN-short-name.md` (course lesson prefix) or `XX-short-name.md`.

## Template

Every spec uses the shared template from the [spec-writing skill](../../.claude/skills/spec-writing/SKILL.md)
(`Spec ID: SPEC-NN`, `Status: draft | approved | implemented`, EARS acceptance criteria, edge cases,
NFRs, inputs and provenance, untrusted inputs, open questions). Write new specs with the
[`spec-writer`](../../.claude/agents/spec-writer.md) agent. Older specs written before 2026-10-14
keep their original shape and count as approved.

## What a reviewer-core spec must pin down

- Inputs: new or changed fields on the run input; which slot of `assemblePrompt` they feed.
- Prompt changes, and how untrusted content is fenced.
- Output / contracts: changes in `@devdigest/shared` (`Review`, `Finding`, …).
- Grounding impact: does the gate or scoring change? (default: no)
