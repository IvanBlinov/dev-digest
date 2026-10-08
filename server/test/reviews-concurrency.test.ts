import { describe, it, expect } from 'vitest';
import { runAgentsConcurrently } from '../src/modules/reviews/concurrency.js';

/** Agent runs of one review start together (bounded), not one after another. */
describe('runAgentsConcurrently', () => {
  function tracker() {
    let inFlight = 0;
    let peak = 0;
    const order: string[] = [];
    const run = async (id: string, ms = 20) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      order.push(`start:${id}`);
      await new Promise((r) => setTimeout(r, ms));
      order.push(`end:${id}`);
      inFlight--;
    };
    return { run, order, peak: () => peak };
  }

  it('runs all agents at the same time when the limit allows', async () => {
    const t = tracker();
    await runAgentsConcurrently(['a', 'b', 'c', 'd', 'e'], 5, (id) => t.run(id));
    expect(t.peak()).toBe(5);
    expect(t.order.slice(0, 5).every((e) => e.startsWith('start:'))).toBe(true);
  });

  it('never exceeds the concurrency limit', async () => {
    const t = tracker();
    await runAgentsConcurrently(['a', 'b', 'c', 'd', 'e'], 2, (id) => t.run(id));
    expect(t.peak()).toBe(2);
    expect(t.order.filter((e) => e.startsWith('end:'))).toHaveLength(5);
  });

  it('limit 1 keeps the old sequential behaviour', async () => {
    const t = tracker();
    await runAgentsConcurrently(['a', 'b', 'c'], 1, (id) => t.run(id));
    expect(t.order).toEqual(['start:a', 'end:a', 'start:b', 'end:b', 'start:c', 'end:c']);
  });

  it('a failing agent does not stop or fail the others', async () => {
    const done: string[] = [];
    await expect(
      runAgentsConcurrently(['ok1', 'boom', 'ok2'], 3, async (id) => {
        if (id === 'boom') throw new Error('provider down');
        await new Promise((r) => setTimeout(r, 5));
        done.push(id);
      }),
    ).resolves.toBeUndefined();
    expect(done.sort()).toEqual(['ok1', 'ok2']);
  });

  it('treats a non-positive limit as 1', async () => {
    const t = tracker();
    await runAgentsConcurrently(['a', 'b'], 0, (id) => t.run(id));
    expect(t.peak()).toBe(1);
  });
});
