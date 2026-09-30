---
name: secret-leakage-gate
description: Blocks merges that commit credentials, tokens or private keys, or log them.
type: security
---
# Secret leakage gate

Treat any credential that reaches the repository or a log as already compromised.

## Flag as CRITICAL
- Literal API keys or tokens: `sk_live_`, `sk-`, `ghp_`, `github_pat_`, `xoxb-`, `AKIA…`, JWTs with a real signature.
- Private keys (`-----BEGIN … PRIVATE KEY-----`), `.pem`/`.p12` files, `id_rsa`.
- Connection strings with an inline password (`postgres://user:pass@…`).
- `.env` files or fixtures containing real-looking secrets.

## Flag as WARNING
- Logging a whole request, headers, config object or error that may carry `authorization`, `cookie`, `password`, `token` or `secret` fields.
- Secrets passed through query strings or written to client-visible responses.
- A default value for a secret in code (`process.env.KEY ?? 'dev-key'`).

## Suggested fix
Move the value to the secrets provider / environment, rotate it immediately, and redact the field in logs.
