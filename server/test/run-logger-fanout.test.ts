import { describe, it, expect } from 'vitest';
import { RunLogger } from '../src/platform/run-logger.js';
import { runBus } from '../src/platform/sse.js';

/** One prelude line fanned out to N runs must be recognisable as ONE event when streams are merged. */
describe('RunLogger fan-out', () => {
  it('copies of one fanned-out event share the same `shared` id; per-run events have none', () => {
    const ids = ['fan-a', 'fan-b', 'fan-c'];
    const log = new RunLogger(runBus, ids);
    log.info('Diff ready — 3 changed file(s); starting 3 agent run(s)');
    log.forRun('fan-b').info('skills: none enabled for this agent');

    const prelude = ids.map((id) => runBus.buffer(id)[0]!);
    expect(new Set(prelude.map((e) => e.shared)).size).toBe(1);
    expect(prelude[0]!.shared).toEqual(expect.any(String));

    const own = runBus.buffer('fan-b')[1]!;
    expect(own.msg).toBe('skills: none enabled for this agent');
    expect(own.shared).toBeUndefined();
    for (const id of ids) runBus.complete(id);
  });

  it('a single-run logger never marks events as shared', () => {
    const log = new RunLogger(runBus, ['solo']);
    log.info('Loading PR diff…');
    expect(runBus.buffer('solo')[0]!.shared).toBeUndefined();
    runBus.complete('solo');
  });
});
