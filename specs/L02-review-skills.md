# L02 — Skills for review agents (Skills Lab)

Status: **implemented on `feat/l02-review-skills` (2026-09-30); all requirements 6–37 verified (see Results).**

## Goal

Skills are reusable, text-only review instructions (markdown). One skill can be linked to many
agents. Users create, import, edit, version, enable/disable, and order skills; the enabled
skills of an agent are injected, **in order**, into that agent's prompt on every review run and
are visible (with their own token count) in the run trace.

**Hard constraint:** a skill is *only* configuration text (name, description, type, markdown
body). It cannot run code, call tools, or reference files at review time. Anything else in an
imported archive is ignored.

## Requirements (verbatim from the brief, numbering kept)

| # | Criterion | How it is checked |
|---|-----------|-------------------|
| 6 | Agents у сайдбарі SKILLS LAB | Лівий сайдбар: пункт **Agents** знаходиться в секції SKILLS LAB, а не WORKSPACE |
| 7 | Сторінка Agents — сітка/список карток | Сайдбар SKILLS LAB → сторінка **Agents**: показує список/сітку плиток (карток) усіх агентів |
| 8 | CRUD над таблицею skills | Backend: `GET/POST/PUT/DELETE /skills[:id]` реально читають/пишуть у Postgres (створити скіл через API → знайти запис у БД напряму; видалити напряму в БД → `GET /skills` більше його не повертає) |
| 9 | Сторінка Skills — сітка карток | Сайдбар SKILLS LAB → **Skills**: список карток скілів — назва, тип, опис, перемикач «увімкнено» |
| 10 | Клік по картці → прев'ю збоку | Клік по картці відкриває прев'ю в БІЧНІЙ панелі (side panel), не в модалці й не на окремій сторінці |
| 11 | Кнопка «додати» скіл | «Додати»/«+»: вибір «створити» або «імпортувати»; створення — в модалці |
| 12 | Форма скіла | Модалка створення: назва, опис, тип, тіло в markdown |
| 13 | Вкладка Skills у редакторі агента | `/agents/:id` → **Skills**: прив'язка скілів, увімкнення/вимкнення, зміна порядку (drag&drop) |
| 14 | Drag&drop реально впливає на промпт | Порядок скілів на вкладці Skills агента = порядок їхніх тіл у промпті. Переставити → запустити → у трейсі блоки теж помінялись |
| 15 | Імпорт скіла з файлу/zip | «додати» → «імпортувати»: `.md` АБО `.zip` (інші архіви не обов'язково); прев'ю ядра скіла перед збереженням |
| 16 | Хоча б один скіл через імпорт | Хоча б один скіл, прив'язаний до нових агентів, має походження «імпортовано» |
| 17 | Контрольний експеримент — Test Quality | Run Review: Test Quality Reviewer на PR з тестом лише на happy-path БЕЗ скіла → не флагує; зі скілом → флагує непокриту гілку й межовий випадок |
| 18 | Контрольний експеримент — API Contract | PR зі зміною сигнатури роуту: без скіла → пропуск; зі скілом → виявляє breaking change |
| 19 | Скіли в трасі промпта | PR → Agent runs → Review runs → траса: окремий блок скілів + кількість токенів **саме цього блоку** (tiktoken або `довжина/4`) |
| 20 | Увімкнено/вимкнено видно в логах | Увімкнений скіл — окремий блок у трейсі; вимкнений — блоку немає |
| 21 | pr-self-review — ручний виклик на змішаний diff | Автовиклик (hook на git push) вимкнений; ручний запуск на diff client/+server/ підтягує обидва набори скілів |
| 22 | Картка скіла — версія і кількість агентів | Картка: + поточна версія і `agent_count` |
| 23 | Кнопка «Видалити» на картці скіла | Є кнопка «Видалити» |
| 24 | Підтвердження видалення скіла | Модалка: підтвердити / скасувати / хрестик |
| 25 | Вкладки сторінки скіла | `/skills/:id`: вкладки Config, Preview, Versioning (Stats — ДЗ №8, не обов'язково) |
| 26 | Preview — рендерений вигляд | Вкладка Preview: відрендерений markdown, не сирий текст |
| 27 | Versioning — список версій | Список усіх версій |
| 28 | Кнопка Diff у версіях | Кожна попередня версія: «Diff» з поточною |
| 29 | Кнопка Restore у версіях | «Restore» повертає тіло до обраної версії |
| 30 | Пошук у Skills-табі агента | Поле пошуку/фільтрації за назвою |
| 31 | Drag&drop лише для увімкнених | Перетягувати можна тільки увімкнені скіли |
| 32 | Плитка агента — базові поля | Назва, опис, LLM/модель, тоггл, лічильник прив'язаних скілів |
| 33 | Кнопка «Видалити» на плитці агента | Видаляє агента з БД |
| 34 | Підтвердження видалення агента | Модалка: підтвердити / скасувати / хрестик |
| 35 | Вкладки сторінки агента | `/agents/:id`: рівно 2 вкладки — Config і Skills |
| 36 | Config агента — поля | Ім'я, опис, провайдер, модель (зі списку), review strategy, системний промпт |
| 37 | Skills-таб агента — повний список | УСІ скіли системи, у кожного — тоггл і лейбл типу (security/convention/custom …) |

## Reference screens (2026-09-29)

1. **Skill editor · Config** — master/detail: left column "Skills" list (search, `+ Add Skill ▾`,
   cards: icon, name, toggle, description, type chip, source chip Manual/Extracted/Community/
   Imported, footer `3 agents · 71% pull · 74% accept`); right panel: header name + type chip +
   `v5`; tabs; form Name*, Description, Type (select), Skill body* (code editor with line
   numbers, filename `<name>.md`, `unsaved` badge, `166 tokens`), Enabled toggle.
2. **Preview** — "Rendered as the reviewing agent receives it." rendered markdown.
3. **Evals** — eval cases list (out of scope, see decisions).
4. **Stats** — used by / pull frequency / accept rate / findings (HW #8, out of scope).
5. **Versions** — "Version history · 5 versions", rows `vN · message · date`, current marked
   `● Current`, others `Diff` + `Restore`.
6. **Search community skills** side sheet — search, language/tag filters, Import buttons.
7. **Agent editor · Skills** — "Skills · 3 of 6 enabled", filter box, "Order matters — earlier
   skills appear earlier in the assembled prompt. Drag to reorder."; rows: drag handle, checkbox,
   name, type chip.
8. **Agent editor · Stats / Evals** — out of scope (req 35: only Config + Skills).
9. Agent cards: name, toggle, description, model chip, `N skills`, footer runs/accept/cost.

## What already exists (verified 2026-09-29)

- DB: `skills` (type enum rubric/convention/security/custom, source enum manual/imported_url/
  extracted/community, body, enabled, version, evidence_files), `skill_versions (skill_id,
  version, body)`, `agent_skills (agent_id, skill_id, order)` — `server/src/db/schema/skills.ts`,
  `agents.ts:51`. No per-link `enabled` flag, no version message.
- Contracts: `Skill`, `SkillType`, `SkillSource`, `AgentSkillLink`, `CommunitySkill` in
  `server/src/vendor/shared/contracts/knowledge.ts:115`.
- API: `GET/POST /agents/:id/skills` (link/reorder) and `DELETE /agents/:id` exist; no `/skills` module.
- Engine: `reviewer-core` `assemblePrompt` already takes `skills: string[]` and emits a
  `## Skills / rules` section + `prompt_assembly.skills` (`reviewer-core/src/prompt.ts:88`);
  the server never passes skills (`run-executor.ts:191`).
- Trace UI already renders a `skills` PromptBlock when present (`TraceBody.tsx:76`), no per-block tokens.
- Tokenizer adapter (`js-tiktoken`) exists on the server (`container.tokenizer`).
- Sidebar: `Agents` is in WORKSPACE (`client/src/vendor/ui/nav.ts:26`).
- Seed: fake repo `acme/payments-api`, PR #482 with pr_files; diffs fall back to `pr_files.patch`
  (`server/src/modules/reviews/diff-loader.ts`), so demo PRs can be seeded with synthetic patches.

## Decisions (agreed 2026-09-29)

| Question | Decision |
|----------|----------|
| Req 10 (side panel) vs 25 (`/skills/:id`) | **Master/detail**, as in the screenshots. `/skills` = list on the left + an empty "select a skill" panel; `/skills/:id` = the same list + the selected skill in the right panel with tabs. The URL is shareable and the list never unmounts. |
| When a skill reaches a prompt | Only if **`skills.enabled` AND `agent_skills.enabled`**. The global toggle is a kill-switch. In the agent's Skills tab a globally disabled skill is greyed out with a hint and cannot be checked. |
| Out of scope | Evals tabs, Stats (HW #8), "Run on evals", community search sheet, agent CI/Evals/Stats tabs, pull%/accept% on cards, import from URL. Skill page tabs: **Config · Preview · Versioning**. Agent page tabs: **Config · Skills** (exactly two). |
| Control experiments | Seed 2 agents (**Test Quality Reviewer**, **API Contract Reviewer**), their skills (`api-contract-guard` created through the import path → `source='imported'`), and 2 demo PRs in `acme/payments-api` with synthetic patches (#483 happy-path-only test, #484 route signature change). Run each experiment without/with the skill using the configured OpenRouter key and record the results below. |
| Agent Skills tab order | The list shows **enabled** links first, in prompt order (draggable), then all other skills alphabetically (not draggable). Checking a skill appends it to the end of the enabled list; unchecking keeps the link row with `enabled=false`. Keyboard: ↑/↓ buttons on enabled rows as a drag alternative. |
| Versioning | Every save that changes name/description/type/body bumps `version` and snapshots the body in `skill_versions` (with optional `message`). Toggling `enabled` does not bump. Create writes v1 "Initial version". **Restore** is non-destructive: it creates v(N+1) with the old body and message "Restored from vK". **Diff** = line diff of vK body vs the current body. |
| Delete | Skill: `DELETE /skills/:id` removes the row; links and versions cascade (FKs already cascade). The confirm modal states how many agents use it. Agent: existing `DELETE /agents/:id`; reviews keep their history (no FK). |
| Import | `.md` or `.zip` (≤ 1 MB upload, ≤ 5 MB uncompressed, ≤ 200 entries). `.md`: optional YAML-ish frontmatter `name/description/type`; otherwise name = slug of the first `#` heading or file name, description = first paragraph, type = `custom`. `.zip`: the core is the shallowest `SKILL.md` (case-insensitive), else the only `.md`; every other entry is listed in `ignored_files` and never stored. Upload is JSON `{filename, content_base64}` (no multipart). Two steps: `POST /skills/import/preview` (parse only) → `POST /skills/import` (parse again + optional edits, saves `source='imported'`). |
| Skill name | kebab-case slug, 2–64 chars, unique per workspace (409 on clash). Body ≤ 20 000 chars. |
| Prompt format | Each enabled skill becomes one block `### Skill: <name> (v<N>, <type>)\n<body>`; blocks are joined in agent order and passed as `skills: string[]` to `reviewer-core` (no reviewer-core change). |
| Trace | `prompt_assembly.skills_blocks[]` = one entry per injected skill `{skill_id, name, version, type, tokens, text}` in prompt order, plus `skills_tokens` = tokenizer count of the whole skills block (server `container.tokenizer`). The trace drawer shows a "Skills · N tokens" section with one sub-block per skill. A disabled skill produces no block. |
| Token count in the editor | Client estimate `ceil(length / 4)` (label "~N tokens"). |
| Skill block formatting lives in the server (exception) | `onion-architecture` says prompt building belongs in `reviewer-core`. The per-skill header, heading demotion and delimiter escaping are done in `server/src/modules/reviews/skills-prompt.ts` because the server must also count tokens per block for the trace, and `reviewer-core` exports are frozen for the CI runner (root AGENTS.md "Do not touch"). `reviewer-core` still owns the `## Skills / rules` section and its placement. Revisit if the CI runner starts injecting skills. |
| Imported skill bodies are untrusted | Bodies are inserted as instructions (that is the feature), but their markdown headings are demoted under the skill header and prompt-delimiter look-alikes are escaped, so an imported file cannot open fake prompt sections. |
| pr-self-review (req 21) | No git hook is configured (`.claude/settings.json` has only the Stop hook). Manual invocation dispatches `client/src/**` → frontend skills and `server/src/**` → onion/fastify skills in one run (dispatch table already covers it). Verify, don't add a hook. |

## API (server)

| Method | Path | Body / returns |
|--------|------|----------------|
| GET | `/skills` | `Skill[]` with `agent_count`, name ascending |
| GET | `/skills/:id` | `Skill` with `agent_count` |
| POST | `/skills` | `CreateSkillBody` → `Skill` (source `manual`, v1 snapshot) — 201 |
| PUT | `/skills/:id` | `UpdateSkillBody` → `Skill` (new version if content changed) |
| DELETE | `/skills/:id` | `{ ok: true }` |
| GET | `/skills/:id/versions` | `SkillVersion[]` newest first |
| POST | `/skills/:id/versions/:version/restore` | → `Skill` (new version) |
| POST | `/skills/import/preview` | `SkillImportRequest` → `SkillImportPreview` (nothing saved) |
| POST | `/skills/import` | `SkillImportCommit` → `Skill` (source `imported`) — 201 |
| GET | `/agents/:id/skills` | `AgentSkillLink[]` (now with `enabled`) |
| POST | `/agents/:id/skills` | existing `skill_ids` / `skill_id` forms **plus** `items: [{skill_id, enabled}]` = full ordered replacement (order = index) |
| GET | `/agents`, `/agents/:id` | `Agent` now carries `skill_count` (enabled links) |

## Parallel implementation — file ownership

Foundation (done first, sequentially): contracts in both `vendor/shared` copies
(`knowledge.ts`, `trace.ts`), migration `0011_l02_skills.sql` (`agent_skills.enabled`,
`skill_versions.message`), `fflate` in server, shared client components
`src/components/confirm-dialog/` and `src/components/skill-type-chip/`.

| Stream | Owns |
|--------|------|
| **A — server skills** | `server/src/modules/skills/**` (new), `server/src/modules/index.ts`, `server/src/modules/agents/**`, `server/src/platform/container.ts` (if a shared repo is needed), `server/src/db/seed.ts` + seed fixtures, `server/test/skills*.test.ts`, `server/test/agents-skills*.test.ts` |
| **B — prompt + trace** | `server/src/modules/reviews/**`, `server/test/reviews-skills*.test.ts`, client `RunTraceDrawer/**`, `client/messages/en/runs.json` |
| **C — client Skills Lab** | `client/src/app/skills/**` (new), `client/src/lib/hooks/skills.ts` (new) + one line in `hooks/index.ts`, `client/src/lib/skill-*.ts` helpers, `client/messages/en/skills.json`, `client/src/vendor/ui/nav.ts` (req 6) |
| **D — client Agents** | `client/src/app/agents/**`, `client/src/lib/hooks/agents.ts`, `client/messages/en/agents.json` |

## Results

Recorded 2026-09-30 against the seeded dev stack (`deepseek/deepseek-v4-flash` via OpenRouter).

| # | Check | Result |
|---|-------|--------|
| Gates | server typecheck + 166 unit tests; 40 DB it-tests on a throwaway DB; client typecheck + 160 tests + `next build` | all pass |
| 8 | create via API → row in Postgres; delete row directly → `GET /skills` omits it | it-test `server/test/skills.it.test.ts` |
| 14 | swap skill order → prompt and `skills_blocks` swap | it-test `server/test/reviews-skills.it.test.ts` (real executor, mock LLM) |
| 18 | API Contract Reviewer on PR #484 **without** `api-contract-guard` | 2 findings, both tenant-security; route rename, `email → emailAddress`, required `tenantId` **not** flagged |
| 18 | same PR **with** the skill (imported, v1) | 3 CRITICAL breaking changes flagged (route `:id → :userId`, `email → emailAddress`, required `tenantId`) + 1 warning |
| 19 | trace of the with-skill run | Prompt assembly shows **Skills · 1 skill · 380 tokens** and the block `api-contract-guard · v1 · 380 tokens` |
| 20 | trace of the without-skill run | no skills block; run log `skills: none enabled for this agent` |
| 21 | manual `pr-self-review` on this branch (client + server diff) | loaded frontend-architecture, react/next/RTL **and** onion-architecture, fastify, drizzle, postgres, security in one run; no git hook exists |
| 17 | Test Quality Reviewer on PR #483 **without** `test-quality-rubric` | 1 finding, about coupon validation in code; tests not mentioned |
| 17 | same PR **with** the skill (v1, 377 tokens in trace) | new WARNING "Test suite covers only the happy path": lists untested branches (negative amount throws, 0, null coupon, expired coupon, cap at max) and boundary values |
| 14 (live) | Performance Reviewer on PR #482 with `pr-quality-rubric` + `secret-leakage-gate`, order A,B then B,A | prompt `### Skill:` sections and `skills_blocks` follow the order both times (234 + 239 tokens, section 473) |
| 20 (live) | same agent with `secret-leakage-gate` disabled on the link | only `pr-quality-rubric` block (234 tokens) |
| 8 (live) | dev DB: POST /skills → row + `skill_versions` 1,2 after PUT → `DELETE` row in SQL → `GET /skills` omits it, `GET /skills/:id` 404 | pass |

### UI checks (browser, argent + Chrome CDP, 2026-09-30)

All pass: 6, 7, 9, 10, 11, 12 (incl. kebab-case and duplicate-name errors), 13, 15 (.md and .zip preview with ignored `README.txt`, `assets/run.js`; `.txt` rejected), 16, 22 (agent count 0 → 1 after linking), 23, 24 (Cancel / X keep, Delete removes), 25, 26, 27, 28 (`+2 −0` diff), 29 (restore v1 → v4 "Restored from v1"), 30, 31 (disabled rows have no handle and don't move), 32, 33/34, 35, 36, 37.

Req 26 initially failed — markdown was parsed but unstyled (Tailwind preflight strips heading sizes and list markers, and `.dd-md` had no rules); fixed with scoped `.dd-md` styles in `client/src/app/globals.css`.

Known follow-ups (not requirements): agent Config edits are discarded without a warning when switching to the Skills tab; the first card click on a cold `/skills` page is occasionally ignored while Next dev compiles the route; a review run has no overall deadline — one Test Quality run waited on the model for >12 min until cancelled (cancel works).

