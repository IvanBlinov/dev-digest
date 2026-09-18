#!/usr/bin/env bash
# Stop hook for the engineering-insights skill.
#
# Fires ONCE per session, and only when files inside a module changed (per git)
# while no INSIGHTS.md was touched. It then asks the agent to review the session
# against the five rubrics and either record insights or state "insights: none".
#
# Safety: honours `stop_hook_active` (never loops) and a per-session marker file.
set -euo pipefail

input="$(cat)"

read -r active session <<<"$(printf '%s' "$input" | node -e '
  let s = "";
  process.stdin.on("data", (d) => (s += d)).on("end", () => {
    let j = {};
    try { j = JSON.parse(s); } catch {}
    process.stdout.write(`${j.stop_hook_active === true} ${j.session_id || "nosession"}`);
  });
')"

# Already re-invoked by this hook once → let the agent stop.
[ "$active" = "true" ] && exit 0

marker="${TMPDIR:-/tmp}/devdigest-insights-${session}"
[ -f "$marker" ] && exit 0

root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
cd "$root" || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

changed="$(git status --porcelain --untracked-files=all | awk '{print $2}')"

code_changed="$(printf '%s\n' "$changed" \
  | grep -E '^(server|client|reviewer-core|e2e)/' \
  | grep -vE '(^|/)INSIGHTS\.md$' \
  | grep -vE '^[^/]+/(docs|specs)/' || true)"

insights_changed="$(printf '%s\n' "$changed" | grep -E '(^|/)INSIGHTS\.md$' || true)"

# Nothing to remind about.
if [ -z "$code_changed" ] || [ -n "$insights_changed" ]; then
  exit 0
fi

touch "$marker"

modules="$(printf '%s\n' "$code_changed" | cut -d/ -f1 | sort -u | tr '\n' ' ')"

node -e '
  const modules = process.argv[1].trim();
  const reason =
    "engineering-insights check (once per session): files changed in [" + modules + "] " +
    "but no INSIGHTS.md was updated. Review this session against the five rubrics " +
    "(Pitfall, Non-obvious behaviour, Architectural decision, Performance, Security). " +
    "Record each finding in the INSIGHTS.md of that module with date + file:line proof " +
    "(format in .claude/skills/engineering-insights/SKILL.md), or reply explicitly with " +
    "\"insights: none\" and finish.";
  process.stdout.write(JSON.stringify({ decision: "block", reason }));
' "$modules"
