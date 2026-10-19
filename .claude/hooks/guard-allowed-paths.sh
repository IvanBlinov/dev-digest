#!/usr/bin/env bash
# PreToolUse guard for path-limited writer agents (test-writer, doc-writer, spec-writer).
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
  test-writer|doc-writer|spec-writer) ;;
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
      client/src/test/setup.ts) block "client test setup is config, not a test — allowed: server/test/**, reviewer-core/test/**, mcp/test/**, client/src/**/*.test.ts(x), client/src/**/test-fixtures.ts, server/src/adapters/mocks.ts, e2e/specs/NN-*.flow.json, INSIGHTS.md" ;;
    esac
    case "$rel" in
      server/test/*|reviewer-core/test/*|mcp/test/*) exit 0 ;;
      client/src/*.test.ts|client/src/*.test.tsx) exit 0 ;;
      client/src/*/test-fixtures.ts) exit 0 ;;
      server/src/adapters/mocks.ts) exit 0 ;;
      e2e/specs/[0-9][0-9]-*.flow.json) exit 0 ;;
      */INSIGHTS.md|INSIGHTS.md) exit 0 ;;
    esac
    block "test-writer may only write server/test/**, reviewer-core/test/**, mcp/test/**, client/src/**/*.test.ts(x), client/src/**/test-fixtures.ts, server/src/adapters/mocks.ts, e2e/specs/NN-*.flow.json, or INSIGHTS.md — got $rel"
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
  spec-writer)
    allowed="specs/, server/specs/, client/specs/, reviewer-core/specs/ or mcp/specs/ as LNN-short-name.md or XX-short-name.md"
    # Deny patterns first.
    case "$rel" in
      specs/plans/*) block "specs/plans/ holds implementation-planner plans — allowed: $allowed" ;;
      e2e/*) block "e2e/specs/ holds flow JSON, not specs — allowed: $allowed" ;;
      specs/README.md|*/specs/README.md) block "spec folder READMEs are owned by doc-writer — propose the edit instead" ;;
    esac
    # The file must sit directly in one of the spec folders (no subfolders).
    case "${rel%/*}" in
      specs|server/specs|client/specs|reviewer-core/specs|mcp/specs) ;;
      *) block "spec-writer may only write $allowed — got $rel" ;;
    esac
    case "${rel##*/}" in
      L[0-9][0-9]*-*.md|XX-*.md) ;;
      *) block "spec file names are LNN-short-name.md or XX-short-name.md — got ${rel##*/}" ;;
    esac
    # Only a draft may change. Legacy specs without a Status line count as approved.
    if [ -e "$root/$rel" ]; then
      status=$(sed -n 's/^Status:[[:space:]]*//p' "$root/$rel" | head -n 1 | tr -d '[:space:]')
      [ "$status" = "draft" ] || block "only specs with 'Status: draft' may be edited (this one has '${status:-no Status line}') — write a new spec with 'Supersedes:' instead"
    fi
    # Approval is the user's. Judge the file as it would look after this call: Write → content;
    # Edit/MultiEdit → old_string → new_string applied to the current text. Its first Status line
    # (any case, markdown such as **Status:** allowed) must read exactly "draft".
    cur_file=/dev/null
    [ -e "$root/$rel" ] && cur_file="$root/$rel"
    after=$(jq -r --rawfile cur "$cur_file" '
      # Fail closed: an edit that would not apply cleanly (old_string empty, missing, or ambiguous
      # without replace_all) is judged as an unknown status and blocked.
      def apply($t): . as $c
        | if ($t.old_string // "") == "" then "Status: unmatched-edit"
          else ($c | split($t.old_string)) as $parts
            | if ($parts | length) == 1 then "Status: unmatched-edit"
              elif ($t.replace_all // false) then $parts | join($t.new_string)
              elif ($parts | length) > 2 then "Status: ambiguous-edit"
              else $parts[0] + $t.new_string + $parts[1] end
          end;
      .tool_input as $t
      | if $t.content == null and $t.old_string == null and $t.new_string == null and $t.edits == null then "Status: draft"
        elif $t.content != null then $t.content
        elif $t.old_string == null and $t.edits == null then
          (if ($t.new_string | test("(?im)^[\\s>*_#-]*status[\\s*_]*:")) then $t.new_string else "Status: draft" end)
        elif $t.edits != null then reduce $t.edits[] as $e ($cur; apply($e))
        else $cur | apply($t) end' <<<"$input")
    # One canonical format, the one consumers read (`^Status:`, case-sensitive): exactly one such
    # line, valued draft. Any loosely written status line (other case, markdown) must say draft too.
    canon=$(printf '%s\n' "$after" | grep -E '^Status:' || true)
    canon_count=$(printf '%s' "$canon" | grep -c '^Status:' || true)
    status=$(printf '%s\n' "$canon" | head -n 1 | sed -E 's/^Status:[[:space:]]*//; s/[[:space:]]*$//')
    loose_bad=$(printf '%s\n' "$after" \
      | grep -iE '^[[:space:]>*_#-]*status[[:space:]*_]*:' \
      | sed -E 's/^[^:]*:[[:space:]*_]*//; s/[[:space:]*_.]*$//' | tr '[:upper:]' '[:lower:]' \
      | grep -vx 'draft' || true)
    if [ "$canon_count" != 1 ] || [ "$status" != "draft" ] || [ -n "$loose_bad" ]; then
      block "spec-writer only writes specs with exactly one 'Status: draft' line (after this edit: ${canon_count} canonical line(s), value '${status:-none}'${loose_bad:+, other status text '$loose_bad'}) — approved/implemented are set by the user and doc-writer"
    fi
    exit 0
    ;;
esac
