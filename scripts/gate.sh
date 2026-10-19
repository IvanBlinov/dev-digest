#!/usr/bin/env bash
# Run one verification gate with short output and log it to the evidence file.
#
# Agents (implementer, plan-verifier) call this instead of running a test/typecheck command
# directly, so a gate costs one tool call and a few lines of context:
#   GATE <step> exit=<n> · <summary line>
#   <up to MAX_FAIL_LINES failure lines, only when the command failed>
#   log: .claude/handoff/<slug>/logs/<step>-<time>.log
# and one JSON line {step, command, exit, summary, fingerprint} is appended to
# .claude/handoff/<slug>/evidence.jsonl (git-ignored), the format plan-verifier reads.
#
# Usage: scripts/gate.sh <slug> <step> -- <command…>
#   <slug>  plan file name without date and .md (e.g. blast-radius)
#   <step>  S3, S3-red, F-2, final, …
#   The command runs with bash -c from the repo root; use "cd client && …" for a package.
# Exit code: the command's own exit code; 64 for a usage error.
set -uo pipefail

MAX_FAIL_LINES=40
usage() { echo "usage: scripts/gate.sh <slug> <step> -- <command…>" >&2; exit 64; }

[ $# -ge 4 ] && [ "$3" = "--" ] || usage
slug="$1"
step="$2"
shift 3
cmd="$*"
case "$slug$step" in
  */* | *..*) echo "gate: slug and step must be plain names" >&2; exit 64 ;;
esac

root=$(git rev-parse --show-toplevel)
cd "$root" || exit 1
dir="$root/.claude/handoff/$slug"
mkdir -p "$dir/logs"
log="$dir/logs/$step-$(date +%Y%m%d-%H%M%S).log"

bash -c "$cmd" >"$log" 2>&1
code=$?

# Summary: the last vitest/jest/tsc/agent-browser result line; a silent success (tsc) is "clean".
summary=$(grep -E 'Test Files |Tests  |[0-9]+ (passed|failed)|Found [0-9]+ errors?|error TS[0-9]+|PASS|FAIL' "$log" \
  | grep -vE '^\s*(✓|×) ' | tail -n 1 | sed -E 's/\x1b\[[0-9;]*m//g; s/^[[:space:]]+//')
if [ -z "$summary" ]; then
  if [ "$code" -eq 0 ]; then summary="clean (no output)"; else summary="failed: $(tail -n 1 "$log" | cut -c1-200)"; fi
fi

echo "GATE $step exit=$code · $summary"
if [ "$code" -ne 0 ]; then
  grep -E '×|FAIL|Error|error TS|expected|AssertionError|✗|BLOCKED' "$log" \
    | sed -E 's/\x1b\[[0-9;]*m//g' | head -n "$MAX_FAIL_LINES"
fi
echo "log: ${log#"$root"/}"

jq -nc --arg step "$step" --arg cmd "$cmd" --argjson exit "$code" --arg summary "$summary" \
  --arg fp "$("$root/scripts/tree-fingerprint.sh")" \
  '{step:$step, command:$cmd, exit:$exit, summary:$summary, fingerprint:$fp}' >>"$dir/evidence.jsonl"

exit "$code"
