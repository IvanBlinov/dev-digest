import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';

describe('loadConfig', () => {
  it('uses defaults when env is empty', () => {
    const c = loadConfig({});
    expect(c.apiUrl).toBe('http://localhost:3001');
    expect(c.timeoutMs).toBe(15000);
  });

  it('rejects a non-http url with a readable error', () => {
    expect(() => loadConfig({ DEVDIGEST_API_URL: 'ftp://x' })).toThrow(/DEVDIGEST_API_URL/);
  });

  it('strips trailing slashes', () => {
    expect(loadConfig({ DEVDIGEST_API_URL: 'http://h:1///' }).apiUrl).toBe('http://h:1');
  });

  it('rejects a non-positive timeout', () => {
    expect(() => loadConfig({ DEVDIGEST_TIMEOUT_MS: '0' })).toThrow(/DEVDIGEST_TIMEOUT_MS/);
  });

  it('treats an unexpanded ${VAR:-default} placeholder (clients that do not expand) as unset', () => {
    const c = loadConfig({ DEVDIGEST_API_URL: '${DEVDIGEST_API_URL:-http://localhost:3001}' });
    expect(c.apiUrl).toBe('http://localhost:3001');
  });
});
