---
name: frontend-architecture
description: "Use when adding, moving, or reviewing any file under client/ in DevDigest — a new page or route, a page-specific or shared React component, a TanStack Query hook, an API call, i18n strings, or a component test — and you need to decide where it goes and how to name it."
---

# Frontend architecture (client/)

Next.js 15 App Router. **Placement follows reuse:** code lives next to the only route that
uses it; it moves to `src/components/` only when a second route needs it.

## Where things go

| What | Path | Example |
|------|------|---------|
| Route (page) | `src/app/<segment>/page.tsx`, dynamic segments `[param]` | `src/app/repos/[repoId]/pulls/[number]/page.tsx` |
| Component used by **one** route | `src/app/<route>/_components/<PascalName>/` | `pulls/[number]/_components/VerdictBanner/` |
| Sub-component of that component | `<PascalName>/_components/<ChildName>/` | `AgentsListView/_components/CreateAgentModal/` |
| Route-level helpers/constants/styles | next to `page.tsx`: `helpers.ts`, `constants.ts`, `styles.ts` | `src/app/repos/[repoId]/pulls/helpers.ts` |
| Component used by **2+ routes** | `src/components/<kebab-name>/<PascalName>.tsx` + `index.ts` | `src/components/severity-counters/SeverityCounters.tsx` |
| Shared multi-part widget | `src/components/<kebab-name>/<PascalPart>/` per part | `src/components/diff-viewer/FileCard/` |
| Data hooks | `src/lib/hooks/<domain>.ts`, re-exported by `src/lib/hooks/index.ts` | `usePrReviews` in `reviews.ts` |
| HTTP | `src/lib/api.ts` — generic `api.get/post/put/patch/del`; hooks call these | `api.get<RunSummary[]>(...)` |
| Pure non-React logic | `src/lib/<kebab-name>.ts` + colocated `<name>.test.ts` | `src/lib/format-usd.ts` |
| UI primitives | import from `@devdigest/ui` (`src/vendor/ui`) — check here first | `Badge`, `Skeleton`, `ErrorState` |
| Contracts/types | import from `@devdigest/shared` — never redeclare API shapes | `FindingRecord`, `Verdict` |
| User-facing strings | `messages/en/<feature>.json`, used via `useTranslations("<feature>")` | `prReview.json` |

`page.tsx` stays thin: read params/search, call hooks, compose `_components`. A page with
real UI logic delegates it to a `<Name>View` component (`agents/page.tsx` → `AgentsListView`).

## Component folder contract

```
<PascalName>/
  <PascalName>.tsx       # REQUIRED — named export `export function <PascalName>(...)`
  index.ts               # REQUIRED — `export { <PascalName> } from "./<PascalName>";`
  <PascalName>.test.tsx  # REQUIRED for every NEW component (RTL + vitest, fetch mocked)
  styles.ts              # when it has styles — `export const s = { ... } satisfies CSSProperties`
  constants.ts           # when it has lookup tables / magic values (UPPER_SNAKE)
  helpers.ts             # when it has pure functions (test them in the component test or a helpers test)
```

Create `styles.ts` / `constants.ts` / `helpers.ts` only when there is content for them.

## Naming

- Folders under `src/app/` = URL segments (lowercase, `[param]`); `_components` = private (not routed).
- Component folders + files: **PascalCase**. Shared-component parent folder: **kebab-case**.
- Non-component TS files: **kebab-case** (`repo-context.tsx`, `github-urls.ts`).
- Hooks: `use<Thing>`, one file per backend area. `core.ts` = settings, secrets, repos, pulls, context files; `agents.ts`, `reviews.ts`, `trace.ts`, `repo-intel.ts` = their modules. A hook for a new server module → new `<module>.ts` + one `export *` line in `hooks/index.ts`.
- i18n namespace = the screen the component belongs to: PR list + PR detail → `prReview`, run trace drawer → `runs`, agents → `agents`, settings → `settings`, app chrome / diff viewer → `shell`. (`onboarding/AddRepoView` predates i18n and still has hard-coded text — do not copy it.) A shared component in `src/components/` uses `common` (or `shell` if it is chrome). A new screen → new `messages/en/<feature>.json` (auto-loaded by `src/i18n/request.ts`). Keys are camelCase.
- A shared component that needs screen-specific wording takes it as a prop; the caller translates.

## Order for a feature that needs new data

1. Contract in `server/src/vendor/shared/` → mirror to `client/src/vendor/shared/` (same commit).
2. Server endpoint — follow the `onion-architecture` skill.
3. Hook in `src/lib/hooks/<area>.ts` calling `api.get<Contract>(...)` (no change to `api.ts`).
4. Component + test, then wire it into `page.tsx` or the parent view.

## Tests

- Colocated: `<PascalName>.test.tsx` next to the component; `<name>.test.ts` next to `src/lib` logic.
- Run under vitest + jsdom (`src/test/setup.ts`); mock `fetch`, never start the API.
- Wrap in `NextIntlClientProvider` with the feature JSON (see `VerdictBanner.test.tsx`).
- A component that calls hooks: `vi.mock` the hooks module and return fixed data (see `RunStatus.test.tsx`); if it also uses `useQueryClient`, wrap in a fresh `QueryClientProvider` (see `AgentCard.test.tsx`).
- Full browser journeys belong in `e2e/specs/NN-name.flow.json`, not in client tests.

## Common mistakes

| Mistake | Fix |
|---------|-----|
| Putting a one-route component in `src/components/` "in case it's reused" | Keep it in that route's `_components/`; move when the 2nd consumer appears |
| Copying an untested legacy component (e.g. `FilterBar`, `PrDetailHeader`) as proof tests are optional | Legacy gaps are debt; every new component ships a test |
| `fetch(...)` in a component or a hook calling `fetch` directly | Hook → `api.*` from `src/lib/api.ts` |
| Writing a new styled badge/button/card | Use the `@devdigest/ui` primitive (`Badge`, `Button`, …) and style around it |
| Hard-coded English in JSX | Key in `messages/en/<feature>.json` |
| Deep relative imports `../../../../../lib/hooks` in new code | Use the `@/` alias (`@/lib/hooks`) |
| Importing from `../server` or `../reviewer-core` | Only `@devdigest/shared` / `@devdigest/ui` cross the boundary |
| Editing `src/vendor/shared` directly | Change `server/src/vendor/shared` first, mirror in the same commit |

Related: `next-best-practices`, `react-best-practices`, `react-testing-library`.
