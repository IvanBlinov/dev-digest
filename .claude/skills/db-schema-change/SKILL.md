---
name: db-schema-change
description: "Use when a DevDigest feature needs a new table, column, index or constraint in Postgres, touches server/src/db/schema/**, or adds a DB-backed route that needs an integration (*.it.test.ts) test."
---

# DB schema change (DevDigest)

Generic modelling advice lives in `drizzle-orm-patterns` and `postgresql-table-design`. This
skill is the **project procedure**; its steps are low-freedom — follow them exactly.

## Procedure

1. Check first: the schema already contains every lesson's tables (`server/AGENTS.md` Layout).
   Reuse an existing empty table/column before adding one.
2. Edit the Drizzle schema in `server/src/db/schema/<domain>.ts` (camelCase in TS, snake_case
   column names in SQL).
3. Generate: `cd server && pnpm db:generate --name <lesson>_<what>` → a **new**
   `server/src/db/migrations/NNNN_<name>.sql` plus `meta/` updates (e.g. `0013_l03_conventions.sql`).
   Never rename the file afterwards — the `meta/` journal references it.
4. Read the generated SQL. It must only contain the intended change (no drops you did not ask for).
5. Apply locally: `cd server && pnpm db:migrate` (migrations never run on boot —
   `server/INSIGHTS.md` "`relation ... does not exist` on first run").
6. Repository layer: queries live in `modules/<name>/repository.ts`, never in routes or services
   (see `onion-architecture`).
7. Integration test `server/test/<feature>.it.test.ts` for each DB-backed route (`test/helpers/pg.ts`).

## Never

- Edit or delete an existing `NNNN_*.sql` or anything in `migrations/meta/` by hand.
- Write a migration file by hand or pipe SQL into `psql` — `migrate.ts` also enables pgvector
  (`server/INSIGHTS.md` "pgvector is enabled by migrate.ts").
- Add auto-migrate on boot.
- `docker compose down -v` to "reset" — it deletes the dev volume with every imported repo.

## Running integration tests on this machine

Testcontainers cannot publish ports here (`server/INSIGHTS.md` 2026-09-17). Use a throwaway DB,
one `.it.test.ts` file per database:

```sh
cd server
TEST_DATABASE_URL=postgres://devdigest:devdigest@localhost:5432/devdigest_it \
  pnpm exec vitest run test/<file>.it.test.ts
```

Create the `devdigest_it` database before, drop it after each file. Without Docker the suite
self-skips — report that as "not run", never as passed.

## Checklist for a plan step

- [ ] schema file + generated migration in the same step; SQL reviewed
- [ ] `pnpm db:migrate` run locally
- [ ] contract fields for new columns follow `shared-contracts` (nullable vs nullish)
- [ ] `.it.test.ts` added/updated and run (or "not run: <reason>")
