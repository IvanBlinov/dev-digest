# L03 — Conventions → Skill

Status: **implemented and verified on `feat/l03-conventions` (2026-09-30)** — stacked on L02 `feat/l02-review-skills`.

## Goal

Analyse a repository's code-style conventions, show them as candidates the user can accept,
reject or edit inline, and turn the accepted ones into one reviewer skill that is linked to an
agent.

### User stories (from the brief)

As a user I can:
- run a Conventions analysis on a repository;
- see every convention found;
- accept / reject an individual insight;
- edit a specific insight;
- open the skill-editing modal built from the insights I selected;
- edit the future skill text and its metadata;
- save the skill or cancel it.

## Requirements (verbatim from the brief, numbering kept)

| # | Criterion | How it is checked |
|---|-----------|-------------------|
| 38 | Роут extract конвенцій | Backend: `POST /repos/:id/conventions/extract` реально запускає аналіз, результат зберігається персистентно (переживає перезавантаження) |
| 39 | Відбір зразків — без моделі | Відбір зразків: конфіги (eslint/tsconfig/prettier) + топ-12 файлів через `repoIntel.getConventionSamples()` — чистим кодом, без виклику LLM |
| 40 | Формат кандидата від моделі | Відповідь LLM: `{категорія, правило, evidence: файл+рядок, впевненість}` |
| 41 | Модалка створення — редагування тіла | SKILLS LAB → **Conventions** → вибрати кандидатів → "Create skill" → модалка: можна редагувати тіло скіла і метадані, не лише назву/опис |
| 42 | Approved → скіл repo-conventions | Прийняті кандидати збираються в один скіл з назвою `repo-conventions`, прилінкований до агента |
| 43 | 4 скіли API Contract Reviewer | breaking-change, response-schema, semver-discipline, deprecation-policy — у кожного директивний опис і приклад «добре/погано» |
| 44 | Conventions у сайдбарі SKILLS LAB | Пункт **Conventions** у секції SKILLS LAB, а не WORKSPACE |
| 45 | Кнопки Run Scan / ReScan | Дві окремі кнопки — "Run Scan" (перший запуск) і "ReScan" (повторний запуск/перегенерація) |
| 46 | Картки кандидатів після скану | Картки показують правило, файл-джерело, відсоток впевненості |
| 47 | Три кнопки на картці кандидата | Accept, Reject, Edit |
| 48 | Reject зберігається | Відхилений кандидат не повертається після перезавантаження і не потрапляє у скіл |
| 49 | Edit inline | Edit редагує картку на місці, без переходу на іншу сторінку |
| 50 | Кнопка Create skill | З'являється після Accept хоча б одного кандидата |
| 51 | Модалка Create skill | Пояснює, що це створення з конвенцій; поля Name/Description; кнопки Cancel і Create |
| 52 | Новий скіл на сторінці Skills | Після Create новий скіл видно у списку на сторінці **Skills** |
| 53 | Settings → Models → Conventions | Окремий рядок для фічі конвенцій з dropdown-пошуком моделі; модель обирається динамічно, не захардкожена |

## Reference screens (2026-09-30)

1. **Conventions page** — "Conventions in `<repo>`", "Detected from N sample files · last scan
   1h ago", `Re-scan` top-right; toolbar `Deselect all` · "3 of 3 accepted" · `Create skill`;
   cards: italic rule, evidence block `path:start-end` + code snippet (copy button), confidence
   bar + %, right column `Accepted`/`Accept` + `Reject` (Edit per req 47).
2. **Create skill from conventions** modal — subtitle = skill name; info banner "Merged from 3
   accepted conventions in `<repo>`. Everything below is editable before you save."; Name*,
   Description, Type (convention), Enabled toggle ("Whether this block is added to agents'
   prompts."), Skill body* editor (`<name>.md`, unsaved, tokens) pre-filled with
   `# <name>`, an intro line, and one `## <rule-slug>` section per convention with the rule and
   "Detected in `file:lines`" + snippet; footer "Saved as v1 · added to Skills Lab", Cancel,
   Create skill.

## What already exists (verified 2026-09-30)

- DB `conventions` (workspace, repo, rule, evidence_path, evidence_snippet, confidence,
  accepted) — `server/src/db/schema/knowledge.ts:31`. No category, no line range, no status
  beyond `accepted`, no scan metadata.
- Contract `ConventionCandidate` — `server/src/vendor/shared/contracts/knowledge.ts:218`.
- `repoIntel.getConventionSamples(repoId, n)` → top-ranked non-test/config files —
  `server/src/modules/repo-intel/service.ts:630` (returns `[]` when the repo isn't indexed).
- `GitClient.readFile(repo, path)` for reading samples/configs.
- Feature-model registry already has `conventions` (default `openai/gpt-5.4`) with
  `resolveFeatureModel` — `server/src/vendor/shared/contracts/platform.ts:74`,
  `server/src/modules/settings/feature-models.ts:51`; client mirror
  `client/src/lib/feature-models.ts:43`.
- Skills Lab (L02): skills CRUD/versioning, agent linking, `SkillTypeChip`, `BodyEditor`,
  `ConfirmDialog`, nav SKILLS LAB section.

## Decisions (agreed 2026-09-30)

| Question | Decision |
|----------|----------|
| Repo for demo/tests | `IvanBlinov/dev-digest` — already cloned and indexed (312 ranked files). A repo with no repo-intel ranks (e.g. the fake `acme/payments-api`) shows a "repo is not indexed" state; Run Scan is disabled there with an explanation. |
| Skill name + agent (req 42, 51) | Default name `repo-conventions` (editable). The modal has an **Attach to agent** select (default General Reviewer, or "Don't link"). Create = new skill (source `extracted`, type `convention`, `evidence_files` = candidate paths) + link to the chosen agent appended at the end, enabled. |
| Req 43 | Add `breaking-change`, `response-schema`, `semver-discipline`, `deprecation-policy` (seeded, directive description, each body has a **Good** / **Bad** example) and link all four to API Contract Reviewer after `api-contract-guard`, which stays (keeps L02 req 16). |
| Default model | **Changed during implementation:** `conventions` → `openrouter` / `openai/gpt-4.1-mini`. The agreed `deepseek/deepseek-v4-flash` is a reasoning model: on a real scan it spent all output tokens on hidden reasoning, returned no content and timed out (> 5 min); `gpt-4.1-mini` finished the same scan in 10 s with 12 grounded candidates. Changeable in Settings → Models (req 53). |
| Scan lifecycle | `POST /repos/:id/conventions/extract` creates a `convention_scans` row (`running`) and returns 202 with it; the work runs in the background. `GET /repos/:id/conventions` returns `{indexed, scan, candidates}` and the client polls while `running`. One running scan per repo (409 if another is running). Failures are stored on the scan (`failed`, `error`). |
| Sampling (req 39) | Pure code, no LLM: configs first — root and one-level-deep `package.json`-adjacent `tsconfig*.json`, `.eslintrc*`, `eslint.config.*`, `.prettierrc*`, `prettier.config.*`, `.editorconfig`, `biome.json` — then `repoIntel.getConventionSamples(repoId, 12)`. Each file is read with `GitClient.readFile`, truncated (≤ 300 lines / 12 000 chars) and sent with line numbers so the model can cite lines. |
| Model output (req 40) | Structured output validated by `ExtractedConventions` (`{category, rule, evidence: {file, start_line, end_line}, confidence}`). **Grounding:** a candidate is dropped if its file wasn't sampled or its lines are out of range; the server cuts the evidence snippet from the real file. Confidence clamped 0–1. |
| Re-scan | ReScan keeps `accepted`, `rejected` and `edited` candidates, deletes the other `pending` ones, and inserts new candidates except those that are **the same convention** as a kept one: same normalised text, or a reworded rule on the same file with overlapping lines (word Jaccard ≥ 0.3), or near-identical wording anywhere (≥ 0.6) — so a rejected rule never comes back even when the model rewords it (req 48). |
| Buttons (req 45) | No scan yet → **Run Scan**. A scan exists → **ReScan**. While running, the button shows "Scanning…" and is disabled. |
| Candidate actions (req 47, 49) | Accept / Reject / Edit on every card. Accepted cards show "Accepted" (click again = back to pending). Reject hides the card immediately and for good. Edit turns the card into an inline form (rule, category, evidence path + lines, snippet) with Save / Cancel; saving sets `edited=true`. Toolbar: "N of M accepted", **Deselect all**, **Create skill** (only when ≥ 1 accepted, req 50). |
| Skill draft (req 41) | `POST /repos/:id/conventions/skill-draft {candidate_ids}` builds the editable draft server-side (pure helper): `# <name>`, an intro ("House conventions for `<repo>`. Flag changes that violate any rule below and cite the offending `file:line`."), then one `## <rule-slug>` section per accepted candidate with the rule and "Detected in `path:start-end`" + fenced snippet. The modal shows the banner, Name, Description, Type, Enabled, Attach to agent, and the body editor (line numbers, unsaved, ~tokens). |

## API (server)

| Method | Path | Body / returns |
|--------|------|----------------|
| GET | `/repos/:id/conventions` | `ConventionsState` (rejected excluded, accepted first, then confidence desc) |
| POST | `/repos/:id/conventions/extract` | → 202 `ConventionScan` (`running`); 409 if a scan is running; 422 if the repo isn't indexed |
| PATCH | `/conventions/:id` | `UpdateConventionBody` → `ConventionCandidate` |
| POST | `/repos/:id/conventions/skill-draft` | `ConventionSkillDraftRequest` → `ConventionSkillDraft` |
| POST | `/repos/:id/conventions/skill` | `CreateConventionSkillBody` → 201 `CreateConventionSkillResult` |

## Parallel implementation — file ownership

Foundation (done first): contracts in both `vendor/shared` copies (`knowledge.ts`, `platform.ts`),
migration `0013_l03_conventions.sql` (`convention_scans`, new `conventions` columns), default
model change (registry + `client/src/lib/feature-models.ts`).

| Stream | Owns |
|--------|------|
| **A — server** | `server/src/modules/conventions/**` (new), `server/src/modules/index.ts`, `server/src/platform/container.ts` (only if needed), `server/src/db/seed.ts` + `server/src/db/seed-skills/**` (req 43), `server/test/conventions*.test.ts` |
| **B — client** | `client/src/app/conventions/**` (new), `client/src/lib/hooks/conventions.ts` (new) + one line in `hooks/index.ts`, `client/messages/en/conventions.json`, `client/src/vendor/ui/nav.ts` (req 44), moving the skill body editor to `client/src/components/skill-body-editor/` (now used by two routes) and updating `client/src/app/skills/**` imports, Settings → Models (req 53) only if a gap is found |

## Results

Recorded 2026-09-30 on the dev stack, repo `IvanBlinov/dev-digest`, model `openrouter/openai/gpt-4.1-mini`.

| # | Result | Evidence |
|---|--------|----------|
| Gates | pass | server typecheck + 191 unit; 50 DB it-tests (9 files, none skipped); client typecheck + 218 tests + `next build`; reviewer-core 27 tests |
| 38 | pass | ReScan in the UI → scan `done` in 6–10 s, 12 candidates persisted in `conventions`; unchanged after a full reload and from a fresh API process |
| 39 | pass | `sample_files` = 4 `tsconfig.json` + 12 ranked files; `sampler.ts` is pure code (no LLM import) |
| 40 | pass | `ExtractedConvention` = `{category, rule, evidence: {file, start_line, end_line}, confidence}`; stored rows carry category, path, lines, confidence |
| 41 | pass | body edited in the modal ("unsaved" shown) → saved skill body contains the edit |
| 42 | pass | default name `repo-conventions`; skill built from accepted candidates only; source `extracted`; linked + enabled on the chosen agent |
| 43 | pass | 4 skills on the Skills page, each with Good/Bad examples in Preview, linked to API Contract Reviewer after `api-contract-guard` |
| 44 | pass | Conventions under SKILLS LAB |
| 45 | pass | "ReScan" on a scanned repo, "Scanning…" while running; "Run Scan" (disabled, with an explanation) on the unindexed `acme/payments-api`; first-run "Run Scan" on an indexed repo covered by `ConventionsView.test.tsx` |
| 46 | pass | cards show rule, `path:start-end` + snippet, confidence bar and % |
| 47 | pass | Accept / Reject / Edit on every card |
| 48 | pass (after fix) | rejected candidate gone after reload and not in the skill; first QA run found a **reworded** rejected rule returning after ReScan → fixed with similarity + evidence dedupe (`isSameConvention`); re-verified live: after ReScan no twin of the rejected or the edited rule |
| 49 | pass | Edit is inline (URL unchanged); edited rule persists after reload with an "edited" chip |
| 50 | pass | Create skill hidden at 0 accepted, shown after 1, hidden again after Deselect all |
| 51 | pass | modal banner "Merged from N accepted conventions in …", Name/Description (+ Type, Enabled, Attach to agent, body); Cancel creates nothing |
| 52 | pass | new skill appears in the Skills list ("Extracted", "1 agent") |
| 53 | pass | Settings → Models has a Conventions row with a searchable dropdown of live OpenRouter models |

Fixed after QA: reworded rejected/edited rules resurrected by ReScan (req 48); renaming the skill in the modal now also renames the body's `# <name>` heading until the user edits it.

Known follow-ups (not requirements): picking a repo in the sidebar switcher while on `/conventions` jumps to that repo's Pull Requests; a brief "No repo selected" flash before the active repo loads.
