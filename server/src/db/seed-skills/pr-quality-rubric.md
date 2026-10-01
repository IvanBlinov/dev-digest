---
name: pr-quality-rubric
description: General PR hygiene rubric — scope, naming, dead code, error handling and readability.
type: rubric
---
# PR quality rubric

Apply this rubric to every changed hunk. Report only concrete problems you can cite by file and line.

## Checklist
- **Scope:** the diff does one thing. Unrelated refactors mixed into a feature change → SUGGESTION to split.
- **Naming:** new identifiers say what they hold; no `data2`, `tmp`, `handleStuff`. Misleading names → WARNING.
- **Dead code:** commented-out blocks, unused imports/variables, unreachable branches → SUGGESTION.
- **Error handling:** a caught error is logged or rethrown with context, never swallowed (`catch {}`) → WARNING.
- **Magic values:** literals with business meaning (limits, timeouts, prices) belong in named constants → SUGGESTION.
- **Function size:** a new function over ~50 lines or nesting deeper than 4 levels → SUGGESTION with a split proposal.

## Severity
- WARNING when the issue can hide a bug; SUGGESTION for readability only. Never CRITICAL from this rubric alone.
