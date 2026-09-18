# Insights — client

Dated entries, newest first. Format and rubrics: [../.claude/skills/engineering-insights/SKILL.md](../.claude/skills/engineering-insights/SKILL.md).

## 2026-09-17 — [Pitfall] Component tests run without the API
Symptom: a new test tries to reach `localhost:3001` and hangs or fails.
Cause: the suite is jsdom with a global setup file; there is no server in the loop, and the only real `fetch` lives in `src/lib/api.ts`.
Rule: mock the specific `src/lib/api.ts` function or the hook; real-stack checks go to `../e2e`.
Proof: `client/vitest.config.ts:15`, `client/vitest.config.ts:17`, `client/src/lib/api.ts:24`

## 2026-09-17 — [Non-obvious behaviour] Home redirects to the first repo returned by the API
Symptom: `/` lands on an unexpected repo on a dev DB.
Cause: the root page calls `router.replace` to `repos[0]` from `GET /repos`; onboarding only when the list is empty.
Rule: do not assume the seeded `acme/payments-api` is first; e2e flows need a freshly seeded DB.
Proof: `client/src/app/page.tsx:17`

## 2026-09-17 — [Architectural decision] `vendor/shared` is a mirror, not a package
Context: no workspace, so the client cannot depend on `server/src/vendor/shared` directly.
Decision: the client carries its own copy under `src/vendor/shared`, aliased as `@devdigest/shared`.
Consequence: contracts drift silently unless both copies change in the same commit; change the server copy first.
Proof: `client/tsconfig.json:24`, `server/tsconfig.json:22`

## 2026-09-17 — [Non-obvious behaviour] i18n messages already contain files for unbuilt lessons
Symptom: `messages/en/` has `blast.json`, `brief.json`, `ci.json`, `conventions.json` with no matching screens.
Cause: the starter ships the full message catalog; screens are added lesson by lesson.
Rule: reuse the existing JSON for a lesson's screen instead of creating a new namespace.
Proof: `client/messages/en/blast.json:1`, `client/messages/en/brief.json:1`
