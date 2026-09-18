# reviewer-core/specs

Feature specs scoped to the engine (new prompt slots, grounding changes, output shapes).
Cross-package features go to [../../specs/](../../specs/README.md).

Naming: `LNN-short-name.md` (course lesson prefix) or `XX-short-name.md`.

## Template

```markdown
# <Feature>

## Goal
## Inputs
New/changed fields on the run input; which slot of `assemblePrompt` they feed.
## Prompt changes
Section added/changed; how untrusted content is fenced.
## Output / contracts
Changes in `@devdigest/shared` (`Review`, `Finding`, …).
## Grounding impact
Does the gate or scoring change? (default: no)
## Tests
Stubbed-provider cases: prompt assembly, grounding, full `run`.
## Acceptance criteria
- [ ] …
```
