# L03b — Prompt-injection guard for skills

Status: **implemented and verified on `feat/l03-conventions` (2026-09-30).**
Extends L02 (Skills Lab). Reference screenshot (2026-09-30): skill detail with a red banner
"INJECTION DETECTED — DO NOT ENABLE · This skill contains prompt injection patterns. It has been
automatically blocked.", an "Injection detected" chip next to the name, and a list card with the
same chip, a red border and "blocked — injection detected".

## Goal

Imported (and any other) skill bodies are analysed for prompt-injection patterns. A skill with a
finding is **blocked**: it shows alert labels, it cannot be enabled on an agent, and it never
reaches a prompt. The labels disappear as soon as the malicious part is removed and the skill is
saved.

## Decisions (agreed 2026-09-30)

| Question | Decision |
|----------|----------|
| Detection | Deterministic, rule-based, server-side, no LLM. Each finding = `{rule, label, severity, line, excerpt}`. |
| Scope | Every skill, every read: the scan is a pure function of the current body, computed when skills are returned, imported (preview) or injected. No stored flag → no stale state, new rules apply to existing skills, labels vanish right after a clean save. No migration. |
| Blocked | `security.status = 'blocked'` iff ≥ 1 finding (rules are high-precision on purpose; seeded skills must scan clean — enforced by a test). |
| Enforcement | 1) Agent Skills tab: checkbox disabled with an "Injection detected" label + hint; 2) `POST /agents/:id/skills` returns **400 `skill_blocked`** when a blocked skill is sent with `enabled: true`; 3) the review executor drops blocked skills even if a link is enabled and logs `skills: N skipped — injection detected (<names>)`. Existing link rows are not modified, so a cleaned skill works again without re-linking. `skill_count` on agents excludes blocked skills. |
| Import | A blocked file can still be imported (as in the screenshot) — the preview shows the findings and "will be imported as blocked"; the saved skill is blocked. |
| UI | Skills list card: red "Injection detected" chip, red border, footer "blocked — injection detected". Skill detail: red banner (as in the screenshot) listing each finding with its line, plus an "Injection detected" chip in the header. All clear after a clean save. |

## Detector rules (initial set)

| rule id | Catches (case-insensitive) |
|---------|----------------------------|
| `ignore-instructions` | ignore / disregard / forget / override … previous / prior / above / system / safety … instructions / prompts / rules / guidelines |
| `role-reassignment` | "you are now …", "you are no longer …", "with no restrictions", "act as an unrestricted …", jailbreak / DAN mode |
| `fake-role-marker` | a line starting with `SYSTEM:` / `ASSISTANT:` / `DEVELOPER:`, `<\|im_start\|>`, `[INST]`, `<system>` |
| `verdict-forcing` | "always give/return score 100", "approve all/every PR(s)", "verdict approve" regardless of content |
| `suppress-findings` | "never/do not flag|mention|report … security|vulnerabilities|issues|findings" |
| `prompt-exfiltration` | "output/print/reveal/repeat/leak … system prompt / your instructions / agent configuration / API keys / secrets / environment variables" (imperative, aimed at the model) |
| `delimiter-spoofing` | `<untrusted` / `</untrusted` look-alikes |
| `hidden-unicode` | zero-width, bidi-override and BOM characters inside the body |

## API changes

| Method | Path | Change |
|--------|------|--------|
| GET | `/skills`, `/skills/:id` | `Skill.security` |
| POST/PUT | `/skills`, `/skills/:id`, `/skills/import` | response `Skill.security` reflects the saved body |
| POST | `/skills/import/preview` | `SkillImportPreview.security` |
| POST | `/agents/:id/skills` | 400 `skill_blocked` when enabling a blocked skill |
| GET | `/agents`, `/agents/:id` | `skill_count` excludes blocked skills |

## Parallel implementation — ownership

Foundation (done): `SkillInjectionFinding`, `SkillSecurity`, `Skill.security`,
`SkillImportPreview.security` in both `vendor/shared/contracts/knowledge.ts` copies.

| Stream | Owns |
|--------|------|
| **A — server** | `server/src/modules/skills/**` (new `injection.ts` detector + wiring), `server/src/modules/agents/**` (enable guard, skill_count), `server/src/modules/reviews/**` (executor filter + log), `server/test/skills-injection*.test.ts`, existing skills/agents/reviews tests as needed |
| **B — client** | `client/src/app/skills/**`, `client/src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/**`, `client/src/components/skill-type-chip` (if a shared "Injection detected" chip fits better → new `client/src/components/injection-chip/`), `client/messages/en/{skills,agents,common}.json` |

## Results

Verified 2026-09-30 on the dev stack.

| Check | Result |
|-------|--------|
| Gates | server typecheck + 251 unit (60 detector tests) + DB it-tests (skills-injection 3, skills 10, agents-versions 7, reviews-skills 2, conventions 8 — none skipped); client typecheck + 250 tests + `next build` |
| False positives | every seeded skill and the conventions draft scan **clean** (test); 22 benign phrases clean |
| Screenshot body | import preview → `blocked`, 10 findings on lines 1, 6, 9, 10, 11 (ignore-instructions, role-reassignment, prompt-exfiltration, fake-role-marker, verdict-forcing, suppress-findings) |
| UI | red banner "INJECTION DETECTED — DO NOT ENABLE" with findings by line, header chip, list card chip + red border + "blocked — injection detected"; agent Skills tab: chip, disabled checkbox, "Clean the skill body to enable it" |
| API | enabling a blocked skill → 400 `skill_blocked`; disabled link allowed; `skill_count` excludes it |
| Unblock | PUT with a clean body → `security.status = clean`, all labels gone in the UI, enabling → 200 |

Fixed during verification: on narrow list cards the injection chip squeezed the skill name to zero width.
