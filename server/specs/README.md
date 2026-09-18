# server/specs

Feature specs scoped to the API. Cross-package features go to [../../specs/](../../specs/README.md).

Naming: `LNN-short-name.md` (course lesson prefix) or `XX-short-name.md`.

## Template

```markdown
# <Feature>

## Goal
## Scope (in / out)
## Routes
Method, path, Zod request/response contracts (names in `@devdigest/shared`).
## Data
Schema tables touched, migration required (yes/no).
## Adapters / ports
New or changed ports; mock behaviour in `src/adapters/mocks.ts`.
## Tests
- unit: …
- `*.it.test.ts`: …
## Acceptance criteria
- [ ] …
```
