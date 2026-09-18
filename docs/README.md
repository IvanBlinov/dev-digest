# Project-wide docs

Design documentation that spans packages. Module-specific docs live in `<package>/docs/`.

- [agent-prompts/](agent-prompts/README.md) — how a reviewer agent's `system_prompt` becomes
  the messages the model sees; canonical copies of the General, Security and Performance prompts.

## What belongs here

- Cross-module architecture decisions (ADR style: context → decision → consequences).
- Data-flow diagrams that cross the API/UI/engine boundary.
- Course-lesson design notes that affect several packages.

Do **not** put "how to run" content here — that is the job of the root [README.md](../README.md).
