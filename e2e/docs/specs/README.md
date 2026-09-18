# e2e/docs/specs

Human-written specs for browser journeys. Each one becomes a `../../specs/NN-name.flow.json`.

Naming: `LNN-short-name.md` (course lesson prefix) or `XX-short-name.md`.

## Template

```markdown
# <Journey>

## Goal
What a user does, start to finish.
## Seeded data required
Repo / PR / agents the flow relies on (must exist after `pnpm db:seed`).
## Steps
1. open … → wait --url …
2. find text … → click
3. wait --text …
## Not covered
What is deliberately left to client unit tests.
## Acceptance criteria
- [ ] flow file added: `specs/NN-name.flow.json`
- [ ] passes under `npm run e2e:hermetic`
```
