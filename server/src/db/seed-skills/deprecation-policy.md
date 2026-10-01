---
name: deprecation-policy
description: Require a deprecation period before anything public is removed — mark it deprecated, keep it working for at least one release, announce the replacement.
type: convention
---
# Deprecation policy

Nothing public disappears in one step. Removal is the last of three: deprecate, migrate, remove.

## Rules
- Flag the removal of a route, field, parameter or enum value that was not marked deprecated in an earlier release.
- When something is deprecated, require all of: a machine-readable marker (`deprecated: true` in the schema / OpenAPI, a `Deprecation` or `Sunset` response header), the named replacement, and a removal date or version.
- Flag a deprecated field that stopped being populated — deprecated means "still works", not "returns null".
- Flag a rename that does not keep the old name as an alias during the deprecation window.

## Good
```ts
const UserDto = z.object({
  emailAddress: z.string(),
  /** @deprecated use `emailAddress`; removed in v3 (2027-01). */
  email: z.string(),
});
reply.header('Deprecation', 'true').header('Sunset', 'Fri, 01 Jan 2027 00:00:00 GMT');
```

## Bad
```ts
const UserDto = z.object({
  emailAddress: z.string(), // `email` silently removed in the same release
});
```
