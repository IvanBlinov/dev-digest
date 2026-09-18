# client/specs

Screen and feature specs scoped to the web app. Cross-package features go to
[../../specs/](../../specs/README.md).

Naming: `LNN-short-name.md` (course lesson prefix) or `XX-short-name.md`.

## Template

```markdown
# <Screen / feature>

## Goal
## Route(s)
`src/app/...` paths touched or added.
## Data
Hooks used/added in `src/lib/hooks/`, API endpoints, contracts from `@devdigest/shared`.
## UI
States: loading / empty / error / success. Components in `_components/<Name>/`.
## Tests
- `*.test.tsx`: …
- e2e flow (if a main journey changes): `../../e2e/specs/NN-*.flow.json`
## Acceptance criteria
- [ ] …
```
