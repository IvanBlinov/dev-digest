/**
 * Defense-in-depth redaction for log values. The prompt log carries only a
 * content-free manifest, but every string still goes through here so a URL
 * query, userinfo or token-like value can never reach a log line.
 */

const URL_RE = /https?:\/\/[^\s)>\]"'<]+/gi;
const MASK = '[redacted]';

// Order matters: specific prefixes first, then the generic long-run catch-all.
const SECRET_RES: RegExp[] = [
  /\bsk[-_](?:live|test|proj)?[-_]?[A-Za-z0-9_-]{8,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{8,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{8,}/g,
  /\bxox[bpsa]-[A-Za-z0-9-]+/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /[A-Za-z0-9_-]{40,}/g,
];

/** URL -> `host/path` (no scheme, userinfo, query or fragment). */
function stripUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.host}${u.pathname}`.replace(/\/+$/, '');
  } catch {
    return raw.split(/[?#]/)[0] ?? '';
  }
}

export function redactLogValue(s: string): string {
  let out = s.replace(URL_RE, (m) => stripUrl(m));
  for (const re of SECRET_RES) out = out.replace(re, MASK);
  return out;
}
