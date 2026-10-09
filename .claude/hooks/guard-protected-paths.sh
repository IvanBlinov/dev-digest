#!/usr/bin/env bash
# PreToolUse guard for the `implementer` subagent (wired in .claude/agents/implementer.md).
# Enforces AGENTS.md "Do not touch" mechanically instead of by instruction only:
#   Edit/Write  → never on generated migrations, lock files or real .env / secrets files
#   Bash        → never `docker compose down -v`, commit/push, hard reset, or hand-run SQL files
# Exit 2 blocks the tool call; stderr is shown to the agent as the reason.
set -uo pipefail

input=$(cat)
tool=$(jq -r '.tool_name // ""' <<<"$input")

block() { echo "BLOCKED by guard-protected-paths: $1" >&2; exit 2; }

case "$tool" in
  Edit|Write|MultiEdit|NotebookEdit)
    path=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // ""' <<<"$input")
    case "$path" in
      */server/src/db/migrations/*)
        block "migrations are generated — edit server/src/db/schema/*.ts and run 'pnpm db:generate --name <name>' (skill: db-schema-change)" ;;
      */pnpm-lock.yaml|*/package-lock.json)
        block "lock files change only via 'pnpm add' / 'npm install <pkg>', never by hand" ;;
      */.env.example) ;;
      */.env|*/.env.*|*/.devdigest/secrets.json)
        block "secrets live only in ~/.devdigest/secrets.json via SecretsProvider; never written by an agent" ;;
    esac ;;
  Bash)
    cmd=$(jq -r '.tool_input.command // ""' <<<"$input")
    grep -Eq 'docker[ -]compose[^|;&]*down[^|;&]*(-v|--volumes)' <<<"$cmd" \
      && block "'docker compose down -v' deletes the devdigest_pgdata volume"
    grep -Eq '(^|[;&|[:space:]])git[[:space:]]+(commit|push)([[:space:]]|$)' <<<"$cmd" \
      && block "the implementer does not commit or push — the caller does after review"
    grep -Eq 'git[[:space:]]+reset[[:space:]]+--hard|git[[:space:]]+clean[[:space:]]+-[a-z]*f' <<<"$cmd" \
      && block "destructive git command"
    grep -Eq 'psql[^|;&]*-f[^|;&]*migrations/' <<<"$cmd" \
      && block "apply migrations with 'pnpm db:migrate' (it also enables pgvector)"
    ;;
esac
exit 0
