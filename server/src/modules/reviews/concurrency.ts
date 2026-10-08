import PQueue from 'p-queue';

/**
 * Run one review's agents concurrently, at most `concurrency` at a time.
 * Each agent run handles and persists its own failure (runOneAgent), so a
 * rejection here is swallowed per job and never stops the other agents.
 * `concurrency <= 0` falls back to 1 (the old sequential behaviour).
 */
export async function runAgentsConcurrently<T>(
  jobs: readonly T[],
  concurrency: number,
  runOne: (job: T) => Promise<unknown>,
): Promise<void> {
  const queue = new PQueue({ concurrency: Math.max(1, Math.floor(concurrency) || 1) });
  await Promise.all(jobs.map((job) => queue.add(() => runOne(job).catch(() => undefined))));
}
