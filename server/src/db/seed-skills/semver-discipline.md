---
name: semver-discipline
description: Check that the version bump matches the change — breaking API changes need a major version or a new versioned route, never a patch or minor release.
type: rubric
---
# Semver discipline

The version number is a promise to consumers. A breaking change shipped under a minor or patch bump breaks every client that trusts `^x.y.z` ranges.

## Rules
- Flag a breaking contract change in a PR that bumps only the minor or patch version (`package.json`, OpenAPI `info.version`, a changelog heading).
- Flag a breaking change to a versioned route (`/v1/...`) — it must go to `/v2/...` while `/v1` keeps its behaviour.
- Flag a major bump without a changelog / migration note that lists what broke.
- Do not flag a major bump that only adds features; that is allowed, just unnecessary.

## Good
```diff
- "version": "2.4.1",
+ "version": "3.0.0",
  # CHANGELOG: 3.0.0 — BREAKING: `GET /orders` now returns `{ items, next_cursor }`.
```

## Bad
```diff
- "version": "2.4.1",
+ "version": "2.4.2",
  # `GET /orders` response changed from an array to `{ items, next_cursor }`.
```
