# e2e/docs

Design notes for the browser suite. Flow format and running instructions live in
[../README.md](../README.md). Feature specs for new journeys live in [specs/](specs/README.md)
(the package-root `specs/` folder holds the `*.flow.json` test files themselves).

## What belongs here

- Which user journeys are covered and why (mapping flows → product surfaces).
- Seeded-data contract the flows rely on (repo, PR number, agent names).
- Hermetic runner design: ports, lifecycle, teardown.
