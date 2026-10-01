# L03c — Import a skill from a URL

Status: **in progress on `feat/l03-conventions` (2026-09-30).** Extends L02 import (file / zip)
and L03b (injection guard).

## Goal

Skills → Add Skill → **Import from URL**: the user pastes a link to a `.md` / `.markdown` /
`.txt` file; the server fetches it, parses it exactly like an uploaded `.md` (frontmatter → name /
description / type, else heading / first paragraph), runs the injection scan, and shows the same
preview as file import before saving. Saved skills get `source = 'imported_url'` ("Imported
(URL)").

## Decisions (2026-09-30)

| Question | Decision |
|----------|----------|
| Allowed URLs | `http:` / `https:` only. GitHub `github.com/<o>/<r>/blob/<ref>/<path>` is rewritten to `raw.githubusercontent.com/<o>/<r>/<ref>/<path>`; `gist.github.com` page URLs are not supported (use the raw link). |
| SSRF guard (security) | The fetcher resolves the host and refuses loopback, private (RFC 1918, ULA), link-local (incl. `169.254.169.254` metadata), CGNAT, unspecified and multicast addresses — for the initial URL **and every redirect** (redirects followed manually, max 3). No credentials in URLs (`user:pass@`) . |
| Limits | ≤ 1 MB body (stream aborted past the cap), 10 s timeout, content type `text/*`, `application/octet-stream` or missing **and** the path ends in `.md`, `.markdown` or `.txt` (or content type is `text/markdown` / `text/plain`). HTML pages are rejected with a hint to use the raw link. |
| Layering | New port `UrlFetcher` (`vendor/shared/adapters.ts`) + adapter `server/src/adapters/http/url-fetcher.ts`, built in `container.ts` (`container.urlFetcher`, overridable in tests), `MockUrlFetcher` in `adapters/mocks.ts`. The skills service only calls the port. |
| Parsing | Reuse the `.md` path of the existing import parser (`.txt` treated as markdown); the filename for name derivation is the last path segment. |
| Injection | Preview and saved skill carry `security` (L03b); a blocked file can still be imported, stays blocked. |
| Errors | Clear 400s: unsupported scheme, blocked address, not a text file, too large, timeout, HTTP status ≠ 2xx ("The server answered 404"). |

## API

| Method | Path | Body / returns |
|--------|------|----------------|
| POST | `/skills/import-url/preview` | `SkillUrlImportRequest {url}` → `SkillImportPreview` (+ `source_url`, `security`) — nothing saved |
| POST | `/skills/import-url` | `SkillUrlImportCommit {url, name?, description?, type?}` → 201 `Skill` (`source: imported_url`); fetched and parsed again on commit |

Both endpoints get a tight per-route rate limit (like the file import).

## UI

Add Skill ▾ gets **Import from URL** (between Create and Import from file). Modal: URL input +
"Fetch" → preview identical to the file-import preview (editable name / description / type,
rendered body, source URL, warnings, injection findings block) → **Import**. Error messages from
the server are shown inline under the URL field.

## Ownership

| Stream | Owns |
|--------|------|
| **A — server** | `server/src/adapters/http/**` (new), `server/src/adapters/mocks.ts` (add `MockUrlFetcher`), `server/src/platform/container.ts` (`urlFetcher` + override), `server/src/modules/skills/**`, `server/test/skills-url-import*.test.ts`, `server/test/url-fetcher*.test.ts` |
| **B — client** | `client/src/app/skills/**`, `client/src/lib/hooks/skills.ts`, `client/messages/en/skills.json` |

## Results

_To be filled after implementation._
