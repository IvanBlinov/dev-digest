import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/platform/config.js';

const cfg = (env: Record<string, string>) => loadConfig(env as NodeJS.ProcessEnv);

describe('PROMPT_LOG_VERBOSE', () => {
  it('is off and not ignored when unset', () => {
    const c = cfg({ NODE_ENV: 'development' });
    expect(c.promptLogVerbose).toBe(false);
    expect(c.promptLogVerboseIgnored).toBe(false);
  });

  it('turns on with 1 outside production', () => {
    for (const NODE_ENV of ['development', 'test']) {
      const c = cfg({ NODE_ENV, PROMPT_LOG_VERBOSE: '1' });
      expect(c.promptLogVerbose).toBe(true);
      expect(c.promptLogVerboseIgnored).toBe(false);
    }
  });

  it('is ignored (and flagged) in production', () => {
    const c = cfg({ NODE_ENV: 'production', PROMPT_LOG_VERBOSE: '1' });
    expect(c.promptLogVerbose).toBe(false);
    expect(c.promptLogVerboseIgnored).toBe(true);
  });

  it('only the literal 1 enables it', () => {
    for (const v of ['true', '0', '', 'yes']) {
      const c = cfg({ NODE_ENV: 'development', PROMPT_LOG_VERBOSE: v });
      expect(c.promptLogVerbose).toBe(false);
      expect(c.promptLogVerboseIgnored).toBe(false);
    }
  });
});
