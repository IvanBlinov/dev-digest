#!/usr/bin/env bash
# Deterministic statistics of one /implement run, for the /workflow-retro skill.
# Reads .claude/handoff/<slug>/evidence.jsonl (gates) and, when present,
# .claude/handoff/<slug>/implement-state.json (findings, fix rounds, agent usage). Read-only.
#
# Usage: scripts/run-stats.sh <slug>
# Exit code: 0 · 1 when the run has no evidence log · 64 for a usage error.
set -uo pipefail

[ $# -eq 1 ] || { echo "usage: scripts/run-stats.sh <slug>" >&2; exit 64; }
slug="$1"
case "$slug" in */* | *..*) echo "run-stats: slug must be a plain name" >&2; exit 64 ;; esac

root=$(git rev-parse --show-toplevel)
dir="$root/.claude/handoff/$slug"
ev="$dir/evidence.jsonl"
st="$dir/implement-state.json"
[ -f "$ev" ] || { echo "run-stats: no evidence log at ${ev#"$root"/}" >&2; exit 1; }

echo "# Run stats: $slug"
echo
echo "## Gates"
jq -rs '"Gates: \(length) (\(map(select(.exit==0))|length) passed, \(map(select(.exit!=0))|length) failed)"' "$ev"

# Code steps (S<n>…) that have no S<n>-red line.
jq -rs '
  [ .[] | .step ] as $all
  | [ $all[] | capture("^S(?<n>[0-9]+)") | .n | tonumber ] | unique as $steps
  | [ $steps[] | select(("S\(.)-red") as $r | ($all | index($r)) == null) | "S\(.)" ]
  | if length == 0 then "No red run logged: none" else "No red run logged: \(join(", "))" end
' "$ev"

# The same command failing first and passing later (planned red runs, S<n>-red, do not count).
jq -rs '
  map(select(.step | test("-red$") | not))
  | group_by(.command)
  | map(select((map(.exit) | index(0)) as $ok | $ok != null and (map(.exit != 0) | index(true)) != null
               and ((map(.exit != 0) | index(true)) < ((map(.exit) | rindex(0))))))
  | "Failed then passed on rerun: \(length)", (.[] | "  - \(.[0].command)")
' "$ev"

echo
echo "Failed gates by step:"
jq -rs '[ .[] | select(.exit != 0) ] | group_by(.step) | if length == 0 then "  none" else .[] | "  - \(.[0].step): \(length) × — \(.[-1].summary)" end' "$ev"

if [ -f "$st" ]; then
  echo
  echo "## Review and fix loop"
  jq -r '"Fix rounds: \(.round // 0)"' "$st"
  jq -r '(.findings // []) as $f
    | "Findings: \($f|length)"
      + (if ($f|length) > 0 then
           " — " + ([$f | group_by(.status)[] | "\(.[0].status) \(length)"] | join(", "))
           + " · by rule: " + ([$f | group_by(.rule)[] | "\(.[0].rule) ×\(length)"] | join(", "))
         else "" end)' "$st"

  echo
  echo "## Agent usage"
  jq -r '(.agents // []) as $a
    | "Agent tokens: \([$a[].tokens] | add // 0) · tool calls: \([$a[].tool_uses] | add // 0) · minutes: \((([$a[].duration_ms] | add // 0) / 60000 * 10 | round) / 10)",
      ($a | sort_by(-.tokens)[] | "  - \(.name) (\(.label)): \(.tokens) tokens, \(.tool_uses) calls")' "$st"
fi
