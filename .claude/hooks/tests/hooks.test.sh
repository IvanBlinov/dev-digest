#!/usr/bin/env bash
# Table-driven harness for .claude/hooks/*.sh PreToolUse guards.
# Case format: <script> <profile|-> <tool> <path-or-command> <expected-exit> [stderr-must-not-contain]
# Each case builds the PreToolUse JSON a hook receives on stdin and pipes it into the script.
set -uo pipefail

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT" || exit 1

pass=0
fail=0

run_case() {
  local name="$1" script="$2" profile="$3" tool="$4" input="$5" expected_exit="$6" forbidden="${7:-}"
  local json
  if [ "$tool" = "Bash" ]; then
    json=$(jq -n --arg t "$tool" --arg cmd "$input" '{tool_name:$t, tool_input:{command:$cmd}}')
  else
    json=$(jq -n --arg t "$tool" --arg p "$input" '{tool_name:$t, tool_input:{file_path:$p}}')
  fi

  local args=("$ROOT/.claude/hooks/$script")
  if [ "$profile" != "-" ]; then
    args+=("$profile")
  fi

  local stderr_out exit_code
  stderr_out=$(CLAUDE_PROJECT_DIR="$ROOT" bash "${args[@]}" <<<"$json" 2>&1 1>/dev/null)
  exit_code=$?

  local ok=1
  if [ "$exit_code" != "$expected_exit" ]; then
    ok=0
  fi
  if [ -n "$forbidden" ] && grep -qi "$forbidden" <<<"$stderr_out"; then
    ok=0
  fi

  if [ "$ok" = 1 ]; then
    echo "PASS $name"
    pass=$((pass + 1))
  else
    echo "FAIL $name (exit=$exit_code expected=$expected_exit stderr=$stderr_out)"
    fail=$((fail + 1))
  fi
}

# --- guard-protected-paths.sh: regression + message cases ---

run_case "protected: migration edit blocked" \
  guard-protected-paths.sh - Edit "$ROOT/server/src/db/migrations/0001_x.sql" 2

run_case "protected: lock file write blocked" \
  guard-protected-paths.sh - Write "$ROOT/client/pnpm-lock.yaml" 2

run_case "protected: .env write blocked" \
  guard-protected-paths.sh - Write "$ROOT/server/.env" 2

run_case "protected: .env.example write allowed" \
  guard-protected-paths.sh - Write "$ROOT/server/.env.example" 0

run_case "protected: docker compose down -v blocked" \
  guard-protected-paths.sh - Bash "docker compose down -v" 2

run_case "protected: git reset --hard blocked" \
  guard-protected-paths.sh - Bash "git reset --hard" 2

run_case "protected: vitest run allowed" \
  guard-protected-paths.sh - Bash "pnpm exec vitest run" 0

run_case "protected: git commit blocked, message is generic" \
  guard-protected-paths.sh - Bash "git commit -m x" 2 "implementer"

# --- guard-allowed-paths.sh: test-writer profile ---

run_case "allow test-writer: server test file" \
  guard-allowed-paths.sh test-writer Edit "$ROOT/server/test/foo.test.ts" 0
run_case "allow test-writer: server test helper" \
  guard-allowed-paths.sh test-writer Edit "$ROOT/server/test/helpers/pg.ts" 0
run_case "allow test-writer: reviewer-core test" \
  guard-allowed-paths.sh test-writer Edit "$ROOT/reviewer-core/test/prompt.test.ts" 0
run_case "allow test-writer: client component test" \
  guard-allowed-paths.sh test-writer Write "$ROOT/client/src/app/x/_components/Y/Y.test.tsx" 0
run_case "allow test-writer: client lib test" \
  guard-allowed-paths.sh test-writer Write "$ROOT/client/src/lib/format-usd.test.ts" 0
run_case "allow test-writer: client test fixtures" \
  guard-allowed-paths.sh test-writer Write "$ROOT/client/src/app/conventions/_components/ConventionsView/test-fixtures.ts" 0
run_case "allow test-writer: mocks.ts (decision 2)" \
  guard-allowed-paths.sh test-writer Edit "$ROOT/server/src/adapters/mocks.ts" 0
run_case "allow test-writer: e2e flow (decision 1)" \
  guard-allowed-paths.sh test-writer Write "$ROOT/e2e/specs/08-new.flow.json" 0
run_case "allow test-writer: server INSIGHTS.md (decision 3)" \
  guard-allowed-paths.sh test-writer Edit "$ROOT/server/INSIGHTS.md" 0

run_case "block test-writer: service.ts" \
  guard-allowed-paths.sh test-writer Edit "$ROOT/server/src/modules/agents/service.ts" 2
run_case "block test-writer: adapter source" \
  guard-allowed-paths.sh test-writer Edit "$ROOT/server/src/adapters/llm/openai.ts" 2
run_case "block test-writer: client test setup" \
  guard-allowed-paths.sh test-writer Edit "$ROOT/client/src/test/setup.ts" 2
run_case "block test-writer: client page" \
  guard-allowed-paths.sh test-writer Write "$ROOT/client/src/app/x/page.tsx" 2
run_case "block test-writer: server package.json" \
  guard-allowed-paths.sh test-writer Edit "$ROOT/server/package.json" 2
run_case "block test-writer: vitest config" \
  guard-allowed-paths.sh test-writer Edit "$ROOT/server/vitest.config.ts" 2
run_case "block test-writer: e2e README" \
  guard-allowed-paths.sh test-writer Write "$ROOT/e2e/specs/README.md" 2
run_case "block test-writer: outside the repo" \
  guard-allowed-paths.sh test-writer Write "/tmp/x.test.ts" 2
run_case "block test-writer: .. segment" \
  guard-allowed-paths.sh test-writer Edit "$ROOT/server/test/../src/app.ts" 2
run_case "block test-writer: empty file_path" \
  guard-allowed-paths.sh test-writer Edit "" 2

# --- guard-allowed-paths.sh: doc-writer profile ---

run_case "allow doc-writer: docs adr" \
  guard-allowed-paths.sh doc-writer Edit "$ROOT/docs/adr-0001-x.md" 0
run_case "allow doc-writer: docs agent-prompts" \
  guard-allowed-paths.sh doc-writer Write "$ROOT/docs/agent-prompts/new.md" 0
run_case "allow doc-writer: server docs" \
  guard-allowed-paths.sh doc-writer Write "$ROOT/server/docs/db-schema.md" 0
run_case "allow doc-writer: e2e docs" \
  guard-allowed-paths.sh doc-writer Write "$ROOT/e2e/docs/coverage.md" 0
run_case "allow doc-writer: root README" \
  guard-allowed-paths.sh doc-writer Edit "$ROOT/README.md" 0
run_case "allow doc-writer: client README" \
  guard-allowed-paths.sh doc-writer Edit "$ROOT/client/README.md" 0
run_case "allow doc-writer: module README" \
  guard-allowed-paths.sh doc-writer Edit "$ROOT/server/src/modules/repo-intel/README.md" 0
run_case "allow doc-writer: root INSIGHTS.md" \
  guard-allowed-paths.sh doc-writer Edit "$ROOT/INSIGHTS.md" 0
run_case "allow doc-writer: specs LNN (decision 4)" \
  guard-allowed-paths.sh doc-writer Write "$ROOT/specs/L04-x.md" 0
run_case "allow doc-writer: pkg specs (decision 4)" \
  guard-allowed-paths.sh doc-writer Write "$ROOT/server/specs/x.md" 0
run_case "allow doc-writer: e2e docs specs (decision 4)" \
  guard-allowed-paths.sh doc-writer Write "$ROOT/e2e/docs/specs/x.md" 0
run_case "allow doc-writer: specs/plans README (decision 4)" \
  guard-allowed-paths.sh doc-writer Edit "$ROOT/specs/plans/README.md" 0
run_case "allow doc-writer: root AGENTS.md (decision 4)" \
  guard-allowed-paths.sh doc-writer Edit "$ROOT/AGENTS.md" 0
run_case "allow doc-writer: pkg AGENTS.md (decision 4)" \
  guard-allowed-paths.sh doc-writer Edit "$ROOT/server/AGENTS.md" 0

run_case "block doc-writer: approved dated plan" \
  guard-allowed-paths.sh doc-writer Edit "$ROOT/specs/plans/2026-10-08-quality-agents.md" 2
run_case "block doc-writer: .claude/agents README" \
  guard-allowed-paths.sh doc-writer Edit "$ROOT/.claude/agents/README.md" 2
run_case "block doc-writer: root CLAUDE.md symlink" \
  guard-allowed-paths.sh doc-writer Write "$ROOT/CLAUDE.md" 2
run_case "block doc-writer: server CLAUDE.md symlink" \
  guard-allowed-paths.sh doc-writer Write "$ROOT/server/CLAUDE.md" 2
run_case "block doc-writer: non-md doc" \
  guard-allowed-paths.sh doc-writer Write "$ROOT/docs/diagram.png" 2
run_case "block doc-writer: server source" \
  guard-allowed-paths.sh doc-writer Edit "$ROOT/server/src/app.ts" 2
run_case "block doc-writer: client source" \
  guard-allowed-paths.sh doc-writer Edit "$ROOT/client/src/app/page.tsx" 2

# --- guard-allowed-paths.sh: other ---

run_case "unknown profile blocked" \
  guard-allowed-paths.sh foo Edit "$ROOT/docs/x.md" 2
run_case "Bash is not judged, test-writer profile" \
  guard-allowed-paths.sh test-writer Bash "pnpm exec vitest run" 0
run_case "Bash is not judged, doc-writer profile" \
  guard-allowed-paths.sh doc-writer Bash "pnpm exec vitest run" 0

run_case_multiedit() {
  local json exit_code stderr_out
  json=$(jq -n --arg t "MultiEdit" --arg p "$ROOT/server/src/app.ts" '{tool_name:$t, tool_input:{file_path:$p}}')
  stderr_out=$(CLAUDE_PROJECT_DIR="$ROOT" bash "$ROOT/.claude/hooks/guard-allowed-paths.sh" test-writer <<<"$json" 2>&1 1>/dev/null)
  exit_code=$?
  if [ "$exit_code" = 2 ]; then
    echo "PASS MultiEdit on source under test-writer blocked"
    pass=$((pass + 1))
  else
    echo "FAIL MultiEdit on source under test-writer blocked (exit=$exit_code stderr=$stderr_out)"
    fail=$((fail + 1))
  fi
}
run_case_multiedit

# --- guard-allowed-paths.sh: node_modules and symlinked parent directories ---

run_case "block doc-writer: README inside node_modules" \
  guard-allowed-paths.sh doc-writer Write "$ROOT/client/node_modules/x/README.md" 2
run_case "block doc-writer: docs inside node_modules" \
  guard-allowed-paths.sh doc-writer Write "$ROOT/client/node_modules/x/docs/a.md" 2
run_case "block test-writer: test file inside node_modules" \
  guard-allowed-paths.sh test-writer Write "$ROOT/client/src/node_modules/x/a.test.ts" 2

# A directory symlink (like the documented .cursor/skills -> ../.claude/skills) must not let a
# write escape into a denied tree. The link is created for the case and removed right after.
LINK="$ROOT/docs/.hook-test-link"
ln -sfn ../.claude "$LINK"
run_case "block doc-writer: write through a symlinked parent into .claude" \
  guard-allowed-paths.sh doc-writer Write "$LINK/agents/README.md" 2
rm -f "$LINK"
ln -sfn ../src "$ROOT/server/test/.hook-test-link"
run_case "block test-writer: server/test symlink pointing into server/src" \
  guard-allowed-paths.sh test-writer Write "$ROOT/server/test/.hook-test-link/app.ts" 2
rm -f "$ROOT/server/test/.hook-test-link"

echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
