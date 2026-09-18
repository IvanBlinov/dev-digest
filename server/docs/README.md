# server/docs

Design notes and internals for `@devdigest/api`. "How to run" lives in [../README.md](../README.md);
the indexer has its own doc at [../src/modules/repo-intel/README.md](../src/modules/repo-intel/README.md).

## What belongs here

- ADRs for this package (DI container shape, adapter ports, rate-limit policy, run lifecycle).
- Database schema notes: why a table exists, which lesson fills it, index rationale.
- Sequence diagrams for a review run (routes → `run-executor` → engine → persistence → SSE).

## Suggested files (create as needed)

- `adr-NNNN-<title>.md` — context / decision / consequences
- `db-schema.md` — table-by-domain map matching `src/db/schema/*.ts`
- `review-run-lifecycle.md` — states, reaping of orphaned `running` runs on boot, SSE trace stream
