import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { HttpUrlFetcher } from '../src/adapters/http/url-fetcher.js';
import { isPublicIp } from '../src/adapters/http/ip-guard.js';

/**
 * L03c — the SSRF-guarded URL fetcher. A local http server exercises the
 * redirect / size-cap / timeout logic; because 127.0.0.1 is blocked BY DESIGN,
 * those tests inject an address check that additionally allows loopback, while
 * the "real guard" block proves the default refuses loopback and metadata hosts.
 */

const OPTS = { maxBytes: 1_048_576, timeoutMs: 2_000 };
const SKILL_MD = '---\nname: demo\n---\n# Demo\n\nBe nice.\n';

let server: http.Server;
let base: string;
let port: number;

function route(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = req.url ?? '/';
  if (url === '/skill.md') {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(SKILL_MD);
  } else if (url === '/redirect-once') {
    res.writeHead(302, { location: '/skill.md' });
    res.end();
  } else if (url.startsWith('/chain/')) {
    const n = Number(url.slice('/chain/'.length));
    res.writeHead(301, { location: n > 0 ? `/chain/${n - 1}` : '/skill.md' });
    res.end();
  } else if (url === '/redirect-metadata') {
    res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data' });
    res.end();
  } else if (url === '/redirect-evil-host') {
    res.writeHead(307, { location: 'http://evil.test/skill.md' });
    res.end();
  } else if (url === '/redirect-file') {
    res.writeHead(302, { location: 'file:///etc/passwd' });
    res.end();
  } else if (url === '/huge-stream') {
    // No content-length: the cap must be enforced while streaming.
    res.writeHead(200, { 'content-type': 'text/plain' });
    const chunk = 'x'.repeat(64 * 1024);
    let sent = 0;
    const pump = () => {
      while (sent < 4 * 1_048_576) {
        sent += chunk.length;
        if (!res.write(chunk)) return void res.once('drain', pump);
      }
      res.end();
    };
    res.on('error', () => undefined);
    pump();
  } else if (url === '/huge-declared') {
    res.writeHead(200, { 'content-type': 'text/plain', 'content-length': String(5 * 1_048_576) });
    res.end();
  } else if (url === '/hang') {
    // Never answers — the timeout must fire.
  } else if (url === '/slow-body') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.write('partial');
  } else if (url === '/missing') {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('nope');
  } else if (url === '/image.png') {
    res.writeHead(200, { 'content-type': 'image/png' });
    res.end(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  } else if (url === '/latin1.md') {
    res.writeHead(200, { 'content-type': 'text/markdown' });
    res.end(Buffer.from([0x23, 0x20, 0xff, 0xfe, 0x0a]));
  } else {
    res.writeHead(500);
    res.end();
  }
}

/** Loopback is allowed ONLY in these tests; every other address goes through the real guard. */
const allowLoopback = (ip: string) => ip === '127.0.0.1' || isPublicIp(ip);
const resolveHost = async (host: string): Promise<string[]> => {
  if (host === 'evil.test') return ['169.254.169.254'];
  if (host === 'mixed.test') return ['8.8.8.8', '10.0.0.7'];
  if (host === 'localhost') return ['127.0.0.1'];
  throw new Error(`unexpected host ${host}`);
};
const testFetcher = () => new HttpUrlFetcher({ isAllowedAddress: allowLoopback, resolveHost });

beforeAll(async () => {
  server = http.createServer(route);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('HttpUrlFetcher — fetch logic (loopback allowed by injection)', () => {
  it('returns the text, content type and final URL', async () => {
    const got = await testFetcher().fetchText(`${base}/skill.md`, OPTS);
    expect(got).toEqual({ url: `${base}/skill.md`, contentType: 'text/plain; charset=utf-8', text: SKILL_MD });
  });

  it('follows a redirect and reports the final URL', async () => {
    const got = await testFetcher().fetchText(`${base}/redirect-once`, OPTS);
    expect(got.url).toBe(`${base}/skill.md`);
    expect(got.text).toBe(SKILL_MD);
  });

  it('follows up to 3 redirects', async () => {
    const got = await testFetcher().fetchText(`${base}/chain/2`, OPTS); // 3 hops
    expect(got.text).toBe(SKILL_MD);
  });

  it('refuses a 4th redirect', async () => {
    await expect(testFetcher().fetchText(`${base}/chain/3`, OPTS)).rejects.toThrow(/too many redirects/i);
  });

  it('re-validates every redirect target (metadata IP, private DNS answer, non-http scheme)', async () => {
    const f = testFetcher();
    await expect(f.fetchText(`${base}/redirect-metadata`, OPTS)).rejects.toThrow(/blocked address/i);
    await expect(f.fetchText(`${base}/redirect-evil-host`, OPTS)).rejects.toThrow(/blocked address/i);
    await expect(f.fetchText(`${base}/redirect-file`, OPTS)).rejects.toThrow(/only http/i);
  });

  it('refuses a host when ANY resolved address is blocked', async () => {
    await expect(testFetcher().fetchText('http://mixed.test/skill.md', OPTS)).rejects.toThrow(/blocked address/i);
  });

  it('aborts a streamed body past maxBytes', async () => {
    await expect(testFetcher().fetchText(`${base}/huge-stream`, OPTS)).rejects.toThrow(/too large \(max 1 MB\)/i);
  });

  it('rejects a declared content-length past maxBytes before reading', async () => {
    await expect(testFetcher().fetchText(`${base}/huge-declared`, OPTS)).rejects.toThrow(/too large/i);
  });

  it('times out when the server never answers', async () => {
    const started = Date.now();
    await expect(testFetcher().fetchText(`${base}/hang`, { ...OPTS, timeoutMs: 300 })).rejects.toThrow(/timed out/i);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('times out when the body stalls', async () => {
    await expect(testFetcher().fetchText(`${base}/slow-body`, { ...OPTS, timeoutMs: 300 })).rejects.toThrow(
      /timed out/i,
    );
  });

  it('maps a non-2xx status to "The server answered <status>"', async () => {
    await expect(testFetcher().fetchText(`${base}/missing`, OPTS)).rejects.toThrow('The server answered 404');
  });

  it('refuses a non-text content type', async () => {
    await expect(testFetcher().fetchText(`${base}/image.png`, OPTS)).rejects.toThrow(/not a text file/i);
  });

  it('refuses a body that is not valid UTF-8', async () => {
    await expect(testFetcher().fetchText(`${base}/latin1.md`, OPTS)).rejects.toThrow(/utf-8/i);
  });
});

describe('HttpUrlFetcher — URL validation', () => {
  it.each(['ftp://example.com/a.md', 'file:///etc/passwd', 'javascript:alert(1)', 'data:text/plain,hi', 'gopher://x/'])(
    'refuses scheme %s',
    async (url) => {
      await expect(new HttpUrlFetcher().fetchText(url, OPTS)).rejects.toThrow(/only http and https/i);
    },
  );

  it('refuses credentials in the URL', async () => {
    await expect(new HttpUrlFetcher().fetchText('https://user:pass@example.com/a.md', OPTS)).rejects.toThrow(
      /credentials/i,
    );
  });

  it('refuses a malformed URL', async () => {
    await expect(new HttpUrlFetcher().fetchText('not a url', OPTS)).rejects.toThrow(/not a valid url/i);
  });
});

describe('HttpUrlFetcher — the real guard (no injection)', () => {
  const real = new HttpUrlFetcher();

  it.each([
    () => `http://127.0.0.1:${port}/skill.md`,
    () => 'http://169.254.169.254/latest/meta-data',
    () => `http://localhost:${port}/skill.md`,
    () => `http://[::1]:${port}/skill.md`,
    () => 'http://[::ffff:127.0.0.1]/',
    () => 'http://[::ffff:169.254.169.254]/latest/meta-data',
    () => 'http://2130706433/', // decimal 127.0.0.1
    () => 'http://0x7f.1/', // hex short form
    () => 'http://10.0.0.1/a.md',
    () => 'http://192.168.1.1/a.md',
    () => 'http://100.64.0.1/a.md',
    () => 'http://0.0.0.0/a.md',
  ])('blocks %#', async (make) => {
    await expect(real.fetchText(make(), OPTS)).rejects.toThrow(/blocked address/i);
  });
});
