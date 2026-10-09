# Development plans

Approved output of the `planner` agent ([.claude/agents/planner.md](../../.claude/agents/planner.md)),
the input of the `implementer` agent ([.claude/agents/implementer.md](../../.claude/agents/implementer.md)).

- File name: `YYYY-MM-DD-<kebab-slug>.md`.
- The planner is read-only; the main session saves the plan here **after the user approves it**.
- A plan describes *how* to build something. *What* to build stays in the spec
  (`specs/LNN-*.md` or the package's `specs/`), which the plan links to.
- Plans are not edited after implementation starts; deviations go into the implementer's report.
