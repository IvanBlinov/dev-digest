# Cross-module specs

Specs for features that touch **more than one package** (e.g. a new API route plus a UI screen
plus an engine prompt slot). Single-package features live in that package's `specs/`.

## File naming

`specs/LNN-short-name.md` — prefix with the course lesson (`L01`…`L08`) when applicable,
otherwise `XX`.

## Template

```markdown
# <Feature name>

## Goal
One paragraph: the user-visible outcome.

## Scope
- In: …
- Out: …

## Contracts
Zod schema changes in `@devdigest/shared`, new API routes, new UI routes.

## Per-package work
- server: …
- client: …
- reviewer-core: …
- e2e: …

## Acceptance criteria
- [ ] …

## Links
README / docs / INSIGHTS entries this depends on.
```
