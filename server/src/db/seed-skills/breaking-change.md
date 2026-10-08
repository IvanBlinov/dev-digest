---
name: breaking-change
description: Flag every change that forces existing API clients to change their code — removed or renamed routes, fields and enum values, new required inputs, changed status codes.
type: convention
---
# Breaking change

A change is **breaking** when a client that worked yesterday fails or silently misbehaves today without changing its own code. Compiling and passing the server's own tests proves nothing about clients.

## Rules
- Flag a removed or renamed route, HTTP method or path parameter as **CRITICAL**.
- Flag a request field, query or header that became required as **CRITICAL**.
- Flag a response field that was removed, renamed or changed type as **CRITICAL**.
- Flag a removed enum value (request or response) and a changed status code for an existing outcome as **WARNING**.
- Do not flag additions: new optional request fields, new response fields and new routes are compatible.
- Cite the changed declaration and name the old and the new shape.

## Good
```ts
// New field is optional with a server-side default — old clients keep working.
const CreateUser = z.object({
  email: z.string().email(),
  locale: z.string().default('en'),
});
```

## Bad
```ts
// `locale` is now required: every existing client gets 422 until it ships an update.
const CreateUser = z.object({
  email: z.string().email(),
  locale: z.string(),
});
```
