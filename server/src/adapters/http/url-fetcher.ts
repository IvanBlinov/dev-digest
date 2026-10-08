import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { FetchedTextFile, UrlFetcher } from '@devdigest/shared';
import { blockedRange } from './ip-guard.js';

/**
 * L03c — `UrlFetcher` over Node's global fetch. This is the SSRF boundary for
 * user-supplied URLs (skill import from a URL):
 *
 *   - only `http:` / `https:`, no `user:pass@` credentials;
 *   - the host is resolved and refused if ANY address is loopback, private,
 *     link-local (incl. 169.254.169.254 metadata), CGNAT, unspecified,
 *     multicast or reserved (`ip-guard.ts`), literal IP hosts included;
 *   - redirects are followed manually (max 3) and every `Location` goes through
 *     the same scheme + address checks;
 *   - one AbortController deadline covers DNS, every hop and the body;
 *   - the body is streamed and abandoned as soon as it exceeds `maxBytes`.
 *
 * Every thrown error is a `UrlFetchError` whose message is safe to show to the
 * user (the service maps it to 400).
 *
 * Residual risk — DNS rebinding: we validate the addresses from our own lookup,
 * but fetch resolves the name again when it connects, so a hostile DNS server
 * with a ~0 TTL could answer a public IP to us and a private one to fetch.
 * Closing that needs pinning the validated IP (a custom undici Agent `connect`
 * with a checked `lookup`, keeping SNI/Host on the name). Out of scope for L03c.
 */

export class UrlFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UrlFetchError';
  }
}

export interface HttpUrlFetcherOptions {
  /** Hostname → every address it resolves to. Default: `dns.lookup(host, { all: true })`. */
  resolveHost?: (hostname: string) => Promise<string[]>;
  /** Address policy. Default: only public unicast (`ip-guard`). Tests may widen it. */
  isAllowedAddress?: (ip: string) => boolean;
  maxRedirects?: number;
}

const DEFAULT_MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const ACCEPT = 'text/markdown, text/plain;q=0.9, text/*;q=0.5, */*;q=0.1';
const USER_AGENT = 'DevDigest-SkillImporter/1.0';

async function defaultResolveHost(hostname: string): Promise<string[]> {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((r) => r.address);
}

const defaultIsAllowedAddress = (ip: string): boolean => blockedRange(ip) === null;

export class HttpUrlFetcher implements UrlFetcher {
  private readonly resolveHost: (hostname: string) => Promise<string[]>;
  private readonly isAllowedAddress: (ip: string) => boolean;
  private readonly maxRedirects: number;

  constructor(opts: HttpUrlFetcherOptions = {}) {
    this.resolveHost = opts.resolveHost ?? defaultResolveHost;
    this.isAllowedAddress = opts.isAllowedAddress ?? defaultIsAllowedAddress;
    this.maxRedirects = opts.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  }

  async fetchText(rawUrl: string, opts: { maxBytes: number; timeoutMs: number }): Promise<FetchedTextFile> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, opts.timeoutMs);
    let url = parseHttpUrl(rawUrl);
    try {
      for (let hop = 0; ; hop++) {
        await this.assertAllowedHost(url, controller.signal);
        const res = await fetch(url, {
          redirect: 'manual',
          signal: controller.signal,
          headers: { accept: ACCEPT, 'user-agent': USER_AGENT },
        });
        if (REDIRECT_STATUSES.has(res.status)) {
          await discard(res);
          if (hop >= this.maxRedirects) throw new UrlFetchError(`Too many redirects (max ${this.maxRedirects})`);
          url = parseRedirect(res.headers.get('location'), url);
          continue;
        }
        if (!res.ok) {
          await discard(res);
          throw new UrlFetchError(`The server answered ${res.status}`);
        }
        const contentType = res.headers.get('content-type');
        assertTextual(contentType);
        const bytes = await readCapped(res, opts.maxBytes);
        return { url: url.toString(), contentType, text: decodeUtf8(bytes) };
      }
    } catch (err) {
      if (timedOut) throw new UrlFetchError(`The request timed out after ${formatSeconds(opts.timeoutMs)}`);
      if (err instanceof UrlFetchError) throw err;
      throw new UrlFetchError(`Could not fetch ${url.host}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private async assertAllowedHost(url: URL, signal: AbortSignal): Promise<void> {
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = isIP(host) ? [host] : await withAbort(this.resolveAddresses(host), signal);
    if (addresses.length === 0) throw new UrlFetchError(`Could not resolve ${host}`);
    const bad = addresses.find((ip) => !this.isAllowedAddress(ip));
    if (bad !== undefined) {
      throw new UrlFetchError(`Refusing to fetch ${host}: it resolves to a blocked address (${blockedRange(bad) ?? 'not allowed'})`);
    }
  }

  private async resolveAddresses(host: string): Promise<string[]> {
    try {
      return await this.resolveHost(host);
    } catch {
      throw new UrlFetchError(`Could not resolve ${host}`);
    }
  }
}

// ---- helpers --------------------------------------------------------------

function parseHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new UrlFetchError('This is not a valid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UrlFetchError(`Only http and https URLs are supported (got ${url.protocol})`);
  }
  if (url.username || url.password) throw new UrlFetchError('URLs with credentials (user:pass@) are not allowed');
  return url;
}

function parseRedirect(location: string | null, from: URL): URL {
  if (!location) throw new UrlFetchError('The server sent a redirect without a Location');
  let next: string;
  try {
    next = new URL(location, from).toString();
  } catch {
    throw new UrlFetchError('The server sent an invalid redirect');
  }
  return parseHttpUrl(next);
}

/** Coarse gate — the skills service applies the precise extension / type rule. */
function assertTextual(contentType: string | null): void {
  if (!contentType) return;
  const mime = contentType.split(';')[0]!.trim().toLowerCase();
  if (mime.startsWith('text/') || mime === 'application/octet-stream' || mime === 'application/markdown') return;
  throw new UrlFetchError(`The URL is not a text file (content type ${mime})`);
}

async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await discard(res);
    throw tooLarge(maxBytes);
  }
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw tooLarge(maxBytes);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new UrlFetchError('The file is not valid UTF-8 text');
  }
}

async function discard(res: Response): Promise<void> {
  await res.body?.cancel().catch(() => undefined);
}

function withAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error('aborted'));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error('aborted'));
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

function tooLarge(maxBytes: number): UrlFetchError {
  return new UrlFetchError(`The file is too large (max ${formatBytes(maxBytes)})`);
}

function formatBytes(n: number): string {
  if (n >= 1_048_576) return `${Math.round((n / 1_048_576) * 10) / 10} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} bytes`;
}

function formatSeconds(ms: number): string {
  return `${Math.round(ms / 100) / 10} s`;
}
