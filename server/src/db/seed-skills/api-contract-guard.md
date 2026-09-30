---
name: api-contract-guard
description: Detects breaking changes to HTTP API contracts — route paths, params, request and response schemas, status codes.
type: convention
---
# API contract guard

Existing clients call this API. Any change they cannot absorb without a code change is a **breaking change**, even if the server compiles and its own tests pass.

## Breaking changes to flag
- **Route path or method changed / renamed**, including path-parameter renames (`/users/:id` → `/users/:userId`) — clients building URLs or frameworks validating params break. → **CRITICAL** when the old route disappears.
- **Required field added to a request body or query** (`required: [..., 'newField']`, a non-optional zod/TypeBox field). Existing callers that do not send it get 400/422. → **CRITICAL**.
- **Response field removed or renamed** (`email` → `emailAddress`), or its type changed. Consumers reading the old key get `undefined`. → **CRITICAL**.
- **Status code changes** for an existing outcome (200 → 201, 404 → 204, error code changes). → **WARNING**.
- **Type narrowing**: an enum loses a value, a string becomes a stricter format, a nullable field becomes non-nullable in the request, a number range shrinks. → **WARNING**.
- Changed defaults or pagination semantics that alter the meaning of an existing response. → **WARNING**.

## Not breaking (do not flag)
- New optional request fields, new response fields, new routes.

## How to report
Cite the line of the changed schema or route declaration. Name the old and new shape. Always give **migration advice**: keep the old route/field as a deprecated alias for one release, make the new request field optional with a default, or version the endpoint (`/v2/...`), and announce the change to API consumers.
