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
run_case "allow test-writer: mcp test" \
  guard-allowed-paths.sh test-writer Edit "$ROOT/mcp/test/foo.test.ts" 0
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

# --- guard-allowed-paths.sh: spec-writer profile ---

# Like run_case, but for a Write/Edit whose new text matters (content / new_string).
run_content_case() {
  local name="$1" tool="$2" path="$3" field="$4" text="$5" expected_exit="$6"
  local json stderr_out exit_code
  json=$(jq -n --arg t "$tool" --arg p "$path" --arg f "$field" --arg x "$text" \
    '{tool_name:$t, tool_input:({file_path:$p} + {($f):$x})}')
  stderr_out=$(CLAUDE_PROJECT_DIR="$ROOT" bash "$ROOT/.claude/hooks/guard-allowed-paths.sh" spec-writer <<<"$json" 2>&1 1>/dev/null)
  exit_code=$?
  if [ "$exit_code" = "$expected_exit" ]; then
    echo "PASS $name"
    pass=$((pass + 1))
  else
    echo "FAIL $name (exit=$exit_code expected=$expected_exit stderr=$stderr_out)"
    fail=$((fail + 1))
  fi
}

run_case "allow spec-writer: new root spec" \
  guard-allowed-paths.sh spec-writer Write "$ROOT/specs/L05-new-feature.md" 0
run_case "allow spec-writer: new XX root spec" \
  guard-allowed-paths.sh spec-writer Write "$ROOT/specs/XX-tooling.md" 0
run_case "allow spec-writer: server spec" \
  guard-allowed-paths.sh spec-writer Write "$ROOT/server/specs/L05-route.md" 0
run_case "allow spec-writer: client spec" \
  guard-allowed-paths.sh spec-writer Write "$ROOT/client/specs/L05-screen.md" 0
run_case "allow spec-writer: reviewer-core spec" \
  guard-allowed-paths.sh spec-writer Write "$ROOT/reviewer-core/specs/L05-prompt.md" 0
run_case "allow spec-writer: new mcp/specs folder" \
  guard-allowed-paths.sh spec-writer Write "$ROOT/mcp/specs/L05-tool.md" 0
run_case "block spec-writer: approved plan folder" \
  guard-allowed-paths.sh spec-writer Write "$ROOT/specs/plans/2026-10-14-x.md" 2
run_case "block spec-writer: e2e flow folder" \
  guard-allowed-paths.sh spec-writer Write "$ROOT/e2e/specs/L05-x.md" 2
run_case "block spec-writer: spec folder README" \
  guard-allowed-paths.sh spec-writer Edit "$ROOT/specs/README.md" 2
run_case "block spec-writer: package spec README" \
  guard-allowed-paths.sh spec-writer Edit "$ROOT/server/specs/README.md" 2
run_case "block spec-writer: subfolder inside specs" \
  guard-allowed-paths.sh spec-writer Write "$ROOT/specs/drafts/L05-x.md" 2
run_case "block spec-writer: source code" \
  guard-allowed-paths.sh spec-writer Write "$ROOT/server/src/modules/x/service.ts" 2
run_case "block spec-writer: docs" \
  guard-allowed-paths.sh spec-writer Write "$ROOT/docs/L05-x.md" 2
run_case "block spec-writer: non-markdown in specs" \
  guard-allowed-paths.sh spec-writer Write "$ROOT/specs/L05-x.json" 2
run_case "block spec-writer: file name without LNN/XX prefix" \
  guard-allowed-paths.sh spec-writer Write "$ROOT/specs/new-feature.md" 2
run_case "block spec-writer: legacy spec without a Status line" \
  guard-allowed-paths.sh spec-writer Edit "$ROOT/specs/L04-mcp-server.md" 2

# Fixture specs for the Status rules; removed right after.
DRAFT="$ROOT/specs/XX-hook-test-draft.md"
APPROVED="$ROOT/specs/XX-hook-test-approved.md"
printf '# Spec: x\nSpec ID: SPEC-99\nStatus: draft\n' >"$DRAFT"
printf '# Spec: y\nSpec ID: SPEC-98\nStatus: approved\n' >"$APPROVED"
run_case "allow spec-writer: edit a draft spec" \
  guard-allowed-paths.sh spec-writer Edit "$DRAFT" 0
run_case "block spec-writer: edit an approved spec" \
  guard-allowed-paths.sh spec-writer Edit "$APPROVED" 2
run_case "block spec-writer: overwrite an approved spec" \
  guard-allowed-paths.sh spec-writer Write "$APPROVED" 2
run_content_case "block spec-writer: Edit sets Status approved" \
  Edit "$DRAFT" new_string "Status: approved" 2
run_content_case "block spec-writer: Write creates an implemented spec" \
  Write "$ROOT/specs/L05-new.md" content $'# Spec: z\nSpec ID: SPEC-97\nStatus: implemented\n' 2
run_content_case "allow spec-writer: Write creates a draft spec" \
  Write "$ROOT/specs/L05-new.md" content $'# Spec: z\nSpec ID: SPEC-97\nStatus: draft\n' 0
# An Edit is judged on the file as it would look afterwards (old_string → new_string applied).
run_edit_case() {
  local name="$1" path="$2" old="$3" new="$4" expected_exit="$5"
  local json stderr_out exit_code
  json=$(jq -n --arg p "$path" --arg o "$old" --arg n "$new" \
    '{tool_name:"Edit", tool_input:{file_path:$p, old_string:$o, new_string:$n}}')
  stderr_out=$(CLAUDE_PROJECT_DIR="$ROOT" bash "$ROOT/.claude/hooks/guard-allowed-paths.sh" spec-writer <<<"$json" 2>&1 1>/dev/null)
  exit_code=$?
  if [ "$exit_code" = "$expected_exit" ]; then
    echo "PASS $name"; pass=$((pass + 1))
  else
    echo "FAIL $name (exit=$exit_code expected=$expected_exit stderr=$stderr_out)"; fail=$((fail + 1))
  fi
}
run_edit_case "block spec-writer: Edit replaces only the word draft" "$DRAFT" "draft" "approved" 2
run_edit_case "block spec-writer: Edit writes a bold, capitalised status" "$DRAFT" "Status: draft" "**Status:** Approved" 2
run_edit_case "block spec-writer: Edit writes an upper-case status" "$DRAFT" "Status: draft" "status: IMPLEMENTED" 2
run_edit_case "block spec-writer: Edit removes the Status line" "$DRAFT" $'Status: draft\n' "" 2
run_edit_case "allow spec-writer: Edit changes the body of a draft" "$DRAFT" "# Spec: x" "# Spec: x renamed" 0
run_content_case "block spec-writer: Write with a bold approved status" \
  Write "$ROOT/specs/L05-new.md" content $'# Spec: z\nSpec ID: SPEC-97\n**Status**: approved\n' 2
run_content_case "block spec-writer: Write a new spec without a Status line" \
  Write "$ROOT/specs/L05-new.md" content $'# Spec: z\nSpec ID: SPEC-97\n' 2
run_content_case "block spec-writer: decorated draft line above a real approved line" \
  Write "$ROOT/specs/L05-new.md" content $'# Spec: z\n**status**: draft\nStatus: approved\n' 2
run_content_case "block spec-writer: two canonical Status lines" \
  Write "$ROOT/specs/L05-new.md" content $'# Spec: z\nStatus: draft\nStatus: draft\n' 2
run_content_case "block spec-writer: only a decorated status line, no canonical one" \
  Write "$ROOT/specs/L05-new.md" content $'# Spec: z\n**Status:** draft\n' 2
run_edit_case "block spec-writer: Edit whose old_string is not in the file" "$DRAFT" "not present anywhere" "Status: approved" 2
run_edit_case "block spec-writer: Edit with an empty old_string on an existing file" "$DRAFT" "" "x" 2
# MultiEdit: a failing edit must stop the whole call, even if a later edit "repairs" the text.
json=$(jq -n --arg p "$DRAFT" '{tool_name:"MultiEdit", tool_input:{file_path:$p, edits:[
  {old_string:"not present anywhere", new_string:"x"},
  {old_string:"unmatched-edit", new_string:"draft"}]}}')
CLAUDE_PROJECT_DIR="$ROOT" bash "$ROOT/.claude/hooks/guard-allowed-paths.sh" spec-writer <<<"$json" >/dev/null 2>&1
if [ $? = 2 ]; then echo "PASS block spec-writer: MultiEdit with a failing edit followed by a repair"; pass=$((pass + 1));
else echo "FAIL block spec-writer: MultiEdit with a failing edit followed by a repair"; fail=$((fail + 1)); fi
rm -f "$DRAFT" "$APPROVED"

echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
