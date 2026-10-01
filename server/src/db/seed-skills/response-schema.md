---
name: response-schema
description: Require every endpoint to declare and honour a response schema — no undeclared fields, no leaked internals, one consistent error envelope.
type: convention
---
# Response schema

Clients code against the documented response, not against whatever the handler happens to return. The schema is the contract; the handler must not drift from it.

## Rules
- Flag a route that returns a body without a declared response schema.
- Flag a handler that returns a raw DB row or ORM entity: internal columns (password hashes, tokens, `deleted_at`) leak and become de-facto API.
- Flag a field whose returned type differs from the declared one (number vs string id, `null` where the schema says required).
- Flag errors returned outside the shared error envelope (`{ error: { code, message } }`).
- Flag a list endpoint that returns a bare array where the rest of the API wraps lists with pagination metadata.

## Good
```ts
app.get('/users/:id', { schema: { response: { 200: UserDto } } }, async (req) => {
  const row = await users.get(req.params.id);
  return toUserDto(row); // maps only the documented fields
});
```

## Bad
```ts
app.get('/users/:id', async (req) => {
  return db.select().from(users).where(eq(users.id, req.params.id)); // passwordHash leaks
});
```
