# reviewer-core/docs

Design rationale for the engine. The pipeline overview lives in [../README.md](../README.md);
agent prompt authoring in [../../docs/agent-prompts/](../../docs/agent-prompts/README.md).

## What belongs here

- Prompt architecture: message layout, slot ordering, why untrusted content is fenced.
- Grounding rules: what counts as a valid citation, how the score is recomputed.
- Structured-output strategy: JSON Schema generation, repair heuristics, failure modes.
- Map-reduce design notes for large diffs (`src/review/reduce.ts`).

## Suggested files (create as needed)

- `prompt-architecture.md`
- `grounding-rules.md`
- `structured-output.md`
