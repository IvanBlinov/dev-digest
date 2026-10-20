#!/usr/bin/env bash
# Tests for scripts/run-stats.sh. Usage: bash scripts/tests/run-stats.test.sh
set -uo pipefail

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT" || exit 1

pass=0
fail=0
check() {
  if [ "$2" = 1 ]; then echo "PASS $1"; pass=$((pass + 1)); else echo "FAIL $1 ${3:-}"; fail=$((fail + 1)); fi
}
has() { grep -qF -- "$2" <<<"$1" && echo 1 || echo 0; }

SLUG="zz-stats-test-$$"
DIR="$ROOT/.claude/handoff/$SLUG"
trap 'rm -rf "$DIR"' EXIT
mkdir -p "$DIR"

line() { jq -nc --arg s "$1" --arg c "$2" --argjson e "$3" --arg m "$4" '{step:$s,command:$c,exit:$e,summary:$m,fingerprint:"f"}'; }
{
  line S1-red "cd server && vitest run a" 1 "Tests 1 failed (1)"
  line S1 "cd server && vitest run a" 0 "Tests 1 passed (1)"
  line S2 "cd server && pnpm typecheck" 0 "clean (no output)"
  line S3 "cd server && vitest run b" 0 "Tests 4 passed (4)"
  line final "scripts/it-db.sh run server/test/x.it.test.ts" 1 "Tests 1 failed | 1 passed (2)"
  line final "scripts/it-db.sh run server/test/x.it.test.ts" 0 "Tests 2 passed (2)"
  line F-1 "cd server && vitest run c" 0 "Tests 1 passed (1)"
} >"$DIR/evidence.jsonl"

jq -n '{slug:"zz", phase:"done", round:2,
  ranges:[{steps:"S1–S3",status:"done"}],
  findings:[{id:"F-1",rule:"B1",status:"fixed"},{id:"F-2",rule:"B12",status:"rejected"},{id:"F-3",rule:"B1",status:"fixed"}],
  agents:[{name:"implementer",label:"S1–S3",tokens:100000,tool_uses:20,duration_ms:200000},
          {name:"architecture-reviewer",label:"review",tokens:40000,tool_uses:5,duration_ms:30000}]}' >"$DIR/implement-state.json"

out=$(scripts/run-stats.sh "$SLUG")
code=$?
check "exits 0" "$([ $code = 0 ] && echo 1 || echo 0)" "(exit=$code)"
check "counts gates" "$(has "$out" "Gates: 7 (5 passed, 2 failed)")" "($out)"
check "lists steps without a red run" "$(has "$out" "No red run logged: S2, S3")"
check "does not list a step that had a red run" "$([ "$(grep -c 'S1,' <<<"$(grep 'No red run' <<<"$out")")" = 0 ] && echo 1 || echo 0)"
check "finds a fail-then-pass rerun" "$(has "$out" "Failed then passed on rerun: 1")"
check "names the rerun command" "$(has "$out" "it-db.sh run server/test/x.it.test.ts")"
check "counts fix rounds" "$(has "$out" "Fix rounds: 2")"
check "groups findings by status" "$(has "$out" "fixed 2")"
check "groups findings by rule" "$(has "$out" "B1 ×2")"
check "sums agent tokens" "$(has "$out" "Agent tokens: 140000")"
impl_line=$(grep -n -- '- implementer (S1–S3)' <<<"$out" | cut -d: -f1)
arch_line=$(grep -n -- '- architecture-reviewer (review)' <<<"$out" | cut -d: -f1)
check "shows the most expensive agent first" "$([ -n "$impl_line" ] && [ -n "$arch_line" ] && [ "$impl_line" -lt "$arch_line" ] && echo 1 || echo 0)" "($impl_line vs $arch_line)"

scripts/run-stats.sh >/dev/null 2>&1
check "no slug is a usage error (exit 64)" "$([ $? = 64 ] && echo 1 || echo 0)"
scripts/run-stats.sh "zz-missing-$$" >/dev/null 2>&1
check "unknown slug exits 1" "$([ $? = 1 ] && echo 1 || echo 0)"

echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
