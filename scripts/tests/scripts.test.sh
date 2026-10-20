#!/usr/bin/env bash
# Tests for scripts/gate.sh (and the argument handling of scripts/it-db.sh).
# Usage: bash scripts/tests/scripts.test.sh
set -uo pipefail

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT" || exit 1

pass=0
fail=0
check() {
  local name="$1" ok="$2" detail="${3:-}"
  if [ "$ok" = 1 ]; then
    echo "PASS $name"
    pass=$((pass + 1))
  else
    echo "FAIL $name ${detail}"
    fail=$((fail + 1))
  fi
}

SLUG="zz-gate-test-$$"
LOGDIR="$ROOT/.claude/handoff/$SLUG"
trap 'rm -rf "$LOGDIR"' EXIT

# --- gate.sh: a passing gate ---
out=$(scripts/gate.sh "$SLUG" S1 -- 'printf "noise line\n%.0s" {1..300}; echo " Tests  3 passed (3)"')
code=$?
check "gate: passing command exits 0" "$([ $code = 0 ] && echo 1 || echo 0)" "(exit=$code)"
check "gate: prints a GATE header with step and exit" "$(grep -q '^GATE S1 exit=0' <<<"$out" && echo 1 || echo 0)" "($out)"
check "gate: prints the summary line" "$(grep -q 'Tests  3 passed (3)' <<<"$out" && echo 1 || echo 0)"
check "gate: keeps output short (no 300 noise lines)" "$([ "$(wc -l <<<"$out")" -le 6 ] && echo 1 || echo 0)" "($(wc -l <<<"$out") lines)"
line=$(tail -n 1 "$LOGDIR/evidence.jsonl" 2>/dev/null)
check "gate: appends one evidence line" "$(jq -e '.step=="S1" and .exit==0 and (.summary|test("3 passed")) and (.fingerprint|length)==64' <<<"$line" >/dev/null 2>&1 && echo 1 || echo 0)" "($line)"
check "gate: keeps the full log on disk" "$(ls "$LOGDIR"/logs/S1-*.log >/dev/null 2>&1 && echo 1 || echo 0)"

# --- gate.sh: a failing gate ---
out=$(scripts/gate.sh "$SLUG" S2 -- 'echo "ok line"; echo "src/a.test.ts > case  × expected 1 to be 2"; echo "FAIL src/a.test.ts"; echo " Tests  1 failed | 4 passed (5)"; exit 1')
code=$?
check "gate: failing command keeps its exit code" "$([ $code = 1 ] && echo 1 || echo 0)" "(exit=$code)"
check "gate: shows failure lines" "$(grep -q 'expected 1 to be 2' <<<"$out" && echo 1 || echo 0)" "($out)"
check "gate: shows the failing summary" "$(grep -q '1 failed | 4 passed' <<<"$out" && echo 1 || echo 0)"
check "gate: logs the failure too" "$(tail -n 1 "$LOGDIR/evidence.jsonl" | jq -e '.step=="S2" and .exit==1' >/dev/null && echo 1 || echo 0)"

# --- gate.sh: tsc-style silence counts as clean ---
out=$(scripts/gate.sh "$SLUG" S3 -- 'true')
check "gate: silent success summarised as clean" "$(grep -q 'clean' <<<"$out" && echo 1 || echo 0)" "($out)"

# --- gate.sh: tsc errors are surfaced ---
out=$(scripts/gate.sh "$SLUG" S4 -- 'echo "src/x.ts(3,1): error TS2322: Type string is not assignable"; exit 2')
check "gate: surfaces tsc errors" "$(grep -q 'error TS2322' <<<"$out" && echo 1 || echo 0)" "($out)"

# --- gate.sh: usage errors ---
scripts/gate.sh "$SLUG" >/dev/null 2>&1
check "gate: missing command is a usage error (exit 64)" "$([ $? = 64 ] && echo 1 || echo 0)"
scripts/gate.sh "../evil" S1 -- true >/dev/null 2>&1
check "gate: rejects a slug with a path" "$([ $? = 64 ] && echo 1 || echo 0)"

# --- it-db.sh: argument handling (no database needed) ---
scripts/it-db.sh >/dev/null 2>&1
check "it-db: no subcommand is a usage error (exit 64)" "$([ $? = 64 ] && echo 1 || echo 0)"
scripts/it-db.sh run server/test/not-an-it-test.ts >/dev/null 2>&1
check "it-db: run rejects a file that is not *.it.test.ts" "$([ $? = 64 ] && echo 1 || echo 0)"

echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
