---
name: e2e-flows
description: "Use when a DevDigest change adds or alters a main user journey (new page, route, or primary action) and needs a deterministic browser flow in e2e/specs/*.flow.json, or when an existing e2e flow fails."
---

# E2E flows (DevDigest)

Rules come from `e2e/AGENTS.md` and `e2e/README.md`; read both before writing a flow.

## When a flow is needed

Only for a **main user journey** (one flow per journey). Component behaviour belongs in
`client/` tests. Specs for new journeys go to `e2e/docs/specs/` (because `e2e/specs/` holds flows).

## Flow shape

`e2e/specs/NN-kebab-name.flow.json`, `NN` = next free number (run order):

```json
{
  "name": "Agents list renders the seeded reviewer agents",
  "description": "What journey this proves and which seeded data it relies on.",
  "steps": [
    { "cmd": ["open", "{BASE}/agents"], "label": "load the agents page" },
    { "cmd": ["wait", "--url", "/agents"], "label": "agents route reached" },
    { "cmd": ["wait", "--load", "networkidle"], "label": "agents fetch settles" },
    { "cmd": ["wait", "--text", "Security Reviewer"], "label": "seeded agent card is visible" }
  ]
}
```

## Rules

1. **Deterministic locators only:** `wait --url`, `wait --text`, `find role|text|label`. Never `chat`.
2. **`wait` is the assertion**; add `"assert": { "stdoutIncludes": … }` only when it adds value.
3. **Seeded data only** — `acme/payments-api`, PR #482, the two built-in agents. Nothing may call a model.
4. Every step has a `label`. Keep flows short.
5. Flows that follow the home redirect assume a fresh DB → verify with `npm run e2e:hermetic`
   (Postgres :5433, API :3101, web :3100), not against the dev stack.
6. Never `docker compose down -v`.

## Verify

```sh
cd e2e && npm run typecheck && npm run e2e:hermetic
```

If agent-browser or Docker is unavailable, report "not run: <reason>".
