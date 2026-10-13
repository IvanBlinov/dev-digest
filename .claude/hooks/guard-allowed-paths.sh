#!/usr/bin/env bash
# PreToolUse guard for path-limited writer agents (test-writer, doc-writer).
# Judges Edit/Write/MultiEdit/NotebookEdit only; any other tool exits 0.
# Fails closed on: missing jq, unknown profile, empty path, path outside the repo, a `..`
# segment, node_modules, or a symlink anywhere on the path (covers every CLAUDE.md and symlinked
# parent directories). Exit 2 blocks the call; stderr names
# the profile and the allowed set so the agent can self-correct.
set -uo pipefail

profile="${1:-}"

block() { echo "BLOCKED by guard-allowed-paths ($profile): $1" >&2; exit 2; }

command -v jq >/dev/null 2>&1 || block "jq is required to evaluate this hook"

input=$(cat)
tool=$(jq -r '.tool_name // ""' <<<"$input")

case "$tool" in
  Edit|Write|MultiEdit|NotebookEdit) ;;
  *) exit 0 ;;
esac

case "$profile" in
  test-writer|doc-writer) ;;
  *) block "unknown profile" ;;
esac

path=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // ""' <<<"$input")
[ -z "$path" ] && block "empty file_path"

root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"
case "$path" in
  "$root"/*) rel="${path#"$root"/}" ;;
  *) block "path is outside the repository root" ;;
esac

case "/$rel/" in
  */../*) block "path contains a '..' segment" ;;
  */node_modules/*) block "path is inside node_modules" ;;
esac

# A symlink anywhere on the existing part of the path (the file itself, e.g. CLAUDE.md, or a parent
# directory) could land the write outside the allowed tree, so every existing component is checked.
probe="$root"
IFS='/' read -ra parts <<<"$rel"
for part in "${parts[@]}"; do
  [ -z "$part" ] && continue
  probe="$probe/$part"
  [ -L "$probe" ] && block "path goes through a symlink (${probe#"$root"/}) — never written"
  [ -e "$probe" ] || break
done

case "$profile" in
  test-writer)
    # Deny patterns first: files that look like they match an allow pattern but are not tests.
    case "$rel" in
      client/src/test/setup.ts) block "client test setup is config, not a test — allowed: server/test/**, reviewer-core/test/**, client/src/**/*.test.ts(x), client/src/**/test-fixtures.ts, server/src/adapters/mocks.ts, e2e/specs/NN-*.flow.json, INSIGHTS.md" ;;
    esac
    case "$rel" in
      server/test/*|reviewer-core/test/*) exit 0 ;;
      client/src/*.test.ts|client/src/*.test.tsx) exit 0 ;;
      client/src/*/test-fixtures.ts) exit 0 ;;
      server/src/adapters/mocks.ts) exit 0 ;;
      e2e/specs/[0-9][0-9]-*.flow.json) exit 0 ;;
      */INSIGHTS.md|INSIGHTS.md) exit 0 ;;
    esac
    block "test-writer may only write server/test/**, reviewer-core/test/**, client/src/**/*.test.ts(x), client/src/**/test-fixtures.ts, server/src/adapters/mocks.ts, e2e/specs/NN-*.flow.json, or INSIGHTS.md — got $rel"
    ;;
  doc-writer)
    # Deny patterns first.
    case "$rel" in
      specs/plans/[0-9][0-9][0-9][0-9]-*.md) block "approved plans under specs/plans/ are immutable — edit the spec or report a deviation instead" ;;
      .claude/*) block "doc-writer never writes .claude/** — propose the edit instead" ;;
    esac
    case "$rel" in
      *.md) ;;
      *) block "doc-writer writes Markdown only — got $rel" ;;
    esac
    case "$rel" in
      docs/*|*/docs/*) exit 0 ;;
      specs/plans/README.md) exit 0 ;;
      specs/*|*/specs/*) exit 0 ;;
      README.md|*/README.md) exit 0 ;;
      INSIGHTS.md|*/INSIGHTS.md) exit 0 ;;
      AGENTS.md|*/AGENTS.md) exit 0 ;;
    esac
    block "doc-writer may only write docs/**, <pkg>/docs/**, specs/** (not an approved dated plan), README.md files, AGENTS.md or INSIGHTS.md — got $rel"
    ;;
esac
