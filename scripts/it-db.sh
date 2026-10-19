#!/usr/bin/env bash
# Throwaway Postgres databases for DB-backed server tests (*.it.test.ts).
#
# Testcontainers cannot publish ports on some machines; server/test/helpers/pg.ts then takes
# TEST_DATABASE_URL instead, which must point at a FRESH database per test file (each file
# migrates and seeds its own schema). This script does that against the compose Postgres
# (./scripts/dev.sh --db-only), so nobody has to improvise createdb/dropdb.
#
# Usage:
#   scripts/it-db.sh run <server/test/x.it.test.ts>…   one fresh DB per file, run it, drop the DB
#   scripts/it-db.sh create                             print TEST_DATABASE_URL of a new DB
#   scripts/it-db.sh drop <db-name>                     drop a DB made by `create`
# Exit code: the test run's exit code (non-zero if any file failed); 64 for a usage error.
set -uo pipefail

usage() { echo "usage: scripts/it-db.sh run <file.it.test.ts>… | create | drop <db-name>" >&2; exit 64; }
[ $# -ge 1 ] || usage

root=$(git rev-parse --show-toplevel)
cd "$root" || exit 1

pg_env() { docker compose exec -T postgres printenv "$1"; }
psql_admin() { docker compose exec -T postgres psql -U "$PGU" -d postgres -qc "$1"; }

connect() {
  PGU=$(pg_env POSTGRES_USER) || { echo "it-db: compose Postgres is not running (./scripts/dev.sh --db-only)" >&2; exit 1; }
  PGP=$(pg_env POSTGRES_PASSWORD)
  PGPORT=$(docker compose port postgres 5432 | cut -d: -f2)
}

create_db() {
  local name="it_$(date +%s)_$$_$RANDOM"
  psql_admin "create database $name" >/dev/null || exit 1
  echo "$name"
}

case "$1" in
  run)
    shift
    [ $# -ge 1 ] || usage
    for f in "$@"; do
      case "$f" in *.it.test.ts) ;; *) echo "it-db: $f is not a *.it.test.ts file" >&2; exit 64 ;; esac
    done
    connect
    status=0
    for f in "$@"; do
      name=$(create_db)
      TEST_DATABASE_URL="postgres://$PGU:$PGP@localhost:$PGPORT/$name" \
        bash -c "cd server && pnpm exec vitest run '${f#server/}'"
      code=$?
      psql_admin "drop database if exists $name" >/dev/null
      [ "$code" -eq 0 ] || status=$code
    done
    exit "$status"
    ;;
  create)
    connect
    name=$(create_db)
    echo "TEST_DATABASE_URL=postgres://$PGU:$PGP@localhost:$PGPORT/$name"
    ;;
  drop)
    [ $# -eq 2 ] || usage
    case "$2" in it_*) ;; *) echo "it-db: only drops databases created by this script (it_*)" >&2; exit 64 ;; esac
    connect
    psql_admin "drop database if exists $2"
    ;;
  *) usage ;;
esac
