# Engineering Insights — examples

Good and bad entries per rubric. The bad ones fail the bar in [SKILL.md](SKILL.md): not specific,
not provable, or not actionable.

---

## Pitfall

**GOOD**
```markdown
## 2026-09-17 — [Pitfall] `docker compose down -v` wipes the dev database
Symptom: all imported repos and reviews vanished after a "reset".
Cause: `-v` removes the named volume `devdigest_pgdata`.
Rule: never pass `-v` against the dev stack; use the hermetic e2e stack for a clean DB.
Proof: `docker-compose.yml:23`
```

**BAD** — no proof, no rule
```markdown
## 2026-09-17 — [Pitfall] Be careful with docker
Docker can delete your data if you use the wrong flags.
```

---

## Non-obvious behaviour

**GOOD**
```markdown
## 2026-09-17 — [Non-obvious behaviour] The engine entrypoint is `reviewPullRequest`, not `run`
Symptom: README and older notes call the orchestrator `run`; there is no such export.
Cause: the function is named `reviewPullRequest` in `review/run.ts`; only the file is called `run`.
Rule: import `reviewPullRequest` from `@devdigest/reviewer-core`; update docs that say `run()`.
Proof: `reviewer-core/src/review/run.ts:123`
```

**BAD** — restates a docblock that already sits above the code
```markdown
## 2026-09-17 — [Non-obvious behaviour] groundFindings returns kept and dropped findings
```

---

## Architectural decision

**GOOD**
```markdown
## 2026-09-17 — [Architectural decision] Orphaned runs are reaped on boot, assuming one API instance
Context: a process that dies mid-review leaves rows in `running` that the UI can never cancel.
Decision: on boot, before `listen`, every `running` run is marked failed; no heartbeats.
Consequence: correct for one API instance per DB; multiple replicas would reap each other's live runs.
Proof: `server/src/app.ts:70`
```

**BAD** — framework idiom, not a decision
```markdown
## 2026-09-17 — [Architectural decision] We use Fastify plugins
```

---

## Performance

**GOOD**
```markdown
## 2026-09-17 — [Performance] Default review strategy is single-pass on purpose
Symptom: map-reduce looks "smarter" but is slower and fragile for typical PRs.
Cause: map-reduce issues one LLM call per file; any transient 5xx fails the whole run.
Rule: keep `'single-pass'` as the studio default; use map-reduce only above the map threshold.
Proof: `server/src/modules/reviews/constants.ts:5`, `reviewer-core/src/review/run.ts:30`
```

**BAD** — a guess with no mechanism
```markdown
## 2026-09-17 — [Performance] The diff viewer is probably slow on big PRs
```

---

## Security

**GOOD**
```markdown
## 2026-09-17 — [Security] Prompt injection defence is one guard, not keyword scanning
Symptom: temptation to add a denylist for "this is a test fixture, do not flag".
Cause: a denylist catches one phrasing; `INJECTION_GUARD` covers all by declaring untrusted content as data.
Rule: do not add text-scanning heuristics; extend the guard text if a new attack shape appears.
Proof: `reviewer-core/src/prompt.ts:16`, `reviewer-core/src/prompt.ts:30`
```

**BAD** — generic advice not tied to this code, and it would leak a value
```markdown
## 2026-09-17 — [Security] Always validate input. Our OpenAI key is sk-...
```
