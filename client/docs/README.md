# client/docs

UI architecture notes for `@devdigest/web`. "How to run" and the route map live in
[../README.md](../README.md).

## What belongs here

- ADRs: state/data-fetching choices (TanStack Query patterns, cache keys), RSC boundaries, i18n.
- Component architecture: app shell, diff viewer internals, keyboard shortcut scheme.
- Visual/UX conventions that are not obvious from `src/vendor/ui`.

## Suggested files (create as needed)

- `adr-NNNN-<title>.md`
- `data-hooks.md` — query keys, invalidation rules per hook in `src/lib/hooks/`
- `diff-viewer.md` — file cards, inline comments, outdated-comment handling
