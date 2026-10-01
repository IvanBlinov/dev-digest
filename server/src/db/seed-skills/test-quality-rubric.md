---
name: test-quality-rubric
description: Checks that tests added in a PR cover every new branch, error path and boundary value, not just the happy path.
type: rubric
---
# Test quality rubric

For every function the PR adds or changes, compare its **branches** with the **tests** in the same PR.

## Checklist
1. **Every new branch needs a test.** Each `if`/`else`, `switch` case, ternary, early `return`, and `throw` introduced by the diff must be exercised by at least one test case. List the uncovered branches by line.
2. **Every error path needs a test.** A function that throws or rejects on invalid input must have a test asserting the error (`toThrow`, `rejects`).
3. **Boundary values.** For numeric or collection inputs, expect tests at the edges: `0`, negative numbers, empty string/array, exactly-at and just-above a maximum/cap, `null`/`undefined` where the type allows it.
4. **Time- and state-dependent logic.** Expiry dates, feature flags, and "already used" states need a test on each side of the condition.
5. **Assertions must be meaningful.** A test that only checks "does not throw" or snapshots an object without asserting the business value does not count as coverage.

## How to report
- A PR whose tests cover **only the happy path** while the implementation has untested branches → **WARNING** finding on the implementation line of the first uncovered branch, naming each missing case (e.g. "negative amount throws — untested", "cap at MAX_DISCOUNT — untested").
- A missing test for an error path that guards money, auth or data integrity → **WARNING**.
- Missing boundary test on a simple helper → **SUGGESTION**.
- Suggest the concrete test cases to add (input → expected output).
