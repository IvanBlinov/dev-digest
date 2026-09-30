import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { ReviewService } from '../src/modules/reviews/service.js';

/**
 * Hermetic tests call buildApp() with the default DATABASE_URL — the developer's
 * dev database. The boot reaper must not run under NODE_ENV=test, or running the
 * unit suite marks a live dev review run as failed.
 */
describe('boot stale-run reaper', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not reap under NODE_ENV=test', async () => {
    const reap = vi.spyOn(ReviewService.prototype, 'reapStaleRuns').mockResolvedValue(0);
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({ config });
    await app.close();
    expect(reap).not.toHaveBeenCalled();
  });

  it('reaps on boot outside tests', async () => {
    const reap = vi.spyOn(ReviewService.prototype, 'reapStaleRuns').mockResolvedValue(0);
    const config = loadConfig({ ...process.env, NODE_ENV: 'development', LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv);
    const app = await buildApp({ config });
    await app.close();
    expect(reap).toHaveBeenCalledTimes(1);
  });
});
