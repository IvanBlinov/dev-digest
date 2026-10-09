#!/usr/bin/env bash
# Prints one sha256 that identifies the exact working tree: HEAD + tracked changes + untracked
# (non-ignored) files. Read-only. The implementer records it next to each gate it ran
# (.claude/handoff/<slug>/evidence.jsonl); plan-verifier recomputes it to decide whether a logged
# result still describes the tree it is verifying.
#
# Usage: scripts/tree-fingerprint.sh
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

{
  git rev-parse HEAD
  git diff HEAD --binary
  git ls-files --others --exclude-standard -z | xargs -0 shasum -a 256 --
} | shasum -a 256 | cut -d' ' -f1
