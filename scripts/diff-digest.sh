#!/usr/bin/env bash
# Compact, read-only digest of <base>..working tree for the reviewer agents (architecture-reviewer,
# plan-verifier). It carries what the boundary and traceability checks need — file list, added
# import/export lines, reviewer-core export changes, vendor/shared mirror state — and no hunk
# bodies, so a reviewer opens full hunks only for the candidates it wants to confirm.
#
# Usage: scripts/diff-digest.sh [base]   (default base: merge-base of HEAD and main)
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

base="${1:-$(git merge-base HEAD main)}"
here="$(dirname "$0")"

echo "# Diff digest"
echo "base=$(git rev-parse --short "$base") head=$(git rev-parse --short HEAD) fingerprint=$("$here/tree-fingerprint.sh")"

echo
echo "## Tracked changes (base..working tree)"
git diff --stat=200 "$base"

echo
echo "## Untracked files"
git ls-files --others --exclude-standard

# Import/export lines, including the `} from '…'` tail of multi-line imports and dynamic import().
IMPORT_RE='^[[:space:]]*(import[[:space:](]|export[[:space:]].*[[:space:]]from[[:space:]]|\}.*[[:space:]]from[[:space:]])'

echo
echo "## Added import/export lines — tracked files"
git diff -U0 "$base" -- '*.ts' '*.tsx' | awk -v re="$IMPORT_RE" '
  /^\+\+\+ b\// { file = substr($0, 7); next }
  /^@@ / { match($0, /\+[0-9]+/); line = substr($0, RSTART + 1, RLENGTH - 1) + 0; next }
  /^\+/ { body = substr($0, 2); if (body ~ re) print file ":" line ": " body; line++; next }
'

echo
echo "## Import/export lines — untracked files"
git ls-files --others --exclude-standard -z -- '*.ts' '*.tsx' \
  | xargs -0 grep -nHE "$IMPORT_RE" -- 2>/dev/null || true

echo
echo "## reviewer-core/src/index.ts changed lines (removals here may break the server)"
git diff -U0 "$base" -- reviewer-core/src/index.ts | grep -E '^[-+]' | grep -vE '^(\+\+\+|---) ' || echo "(none)"

echo
echo "## vendor/shared mirror (diff line count server vs client: now | at base)"
{
  git diff --name-only "$base" -- server/src/vendor/shared client/src/vendor/shared
  git ls-files --others --exclude-standard -- server/src/vendor/shared client/src/vendor/shared
} | sed -E 's#^(server|client)/src/vendor/shared/##' | sort -u | while read -r rel; do
  s="server/src/vendor/shared/$rel"
  c="client/src/vendor/shared/$rel"
  now=$(diff "$s" "$c" 2>/dev/null | wc -l | tr -d ' ' || true)
  then_=$(diff <(git show "$base:$s" 2>/dev/null) <(git show "$base:$c" 2>/dev/null) | wc -l | tr -d ' ' || true)
  flag=""
  [ "${now:-0}" -gt "${then_:-0}" ] && flag="  <-- drift grew"
  echo "$rel: $now | $then_$flag"
done
