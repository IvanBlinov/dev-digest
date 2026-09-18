import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { createDb, type DbHandle } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrate.js';

/**
 * Testcontainers helper: spin a Postgres + pgvector container, run migrations,
 * return a Drizzle client. Uses the same `pgvector/pgvector:pg16` image as
 * docker-compose so the `vector` extension is available.
 *
 * Integration tests gate on `dockerAvailable()` and skip cleanly when Docker is
 * not reachable (CI/sandbox without a Docker daemon).
 *
 * Escape hatch: set `TEST_DATABASE_URL` to run against an EXISTING Postgres
 * (fresh, throwaway database — migrations are applied, nothing is dropped) when
 * Testcontainers cannot publish ports on this machine. Run one `*.it.test.ts`
 * file per database; files assume they own the schema.
 */
export interface PgFixture {
  /** Undefined when `TEST_DATABASE_URL` bypasses Testcontainers. */
  container: StartedPostgreSqlContainer | undefined;
  handle: DbHandle;
  url: string;
  stop: () => Promise<void>;
}

let dockerCache: boolean | undefined;

/** Cheap check: can we reach a Docker daemon? */
export async function dockerAvailable(): Promise<boolean> {
  if (dockerCache !== undefined) return dockerCache;
  try {
    const { execSync } = await import('node:child_process');
    execSync('docker info', { stdio: 'ignore', timeout: 5000 });
    dockerCache = true;
  } catch {
    dockerCache = false;
  }
  return dockerCache;
}

export async function startPg(): Promise<PgFixture> {
  const override = process.env.TEST_DATABASE_URL;
  if (override) {
    await runMigrations(override);
    const handle = createDb(override, { max: 5 });
    return { container: undefined, handle, url: override, stop: () => handle.close() };
  }
  const container = await new PostgreSqlContainer('pgvector/pgvector:pg16')
    .withDatabase('devdigest')
    .withUsername('devdigest')
    .withPassword('devdigest')
    .start();
  const url = container.getConnectionUri();
  await runMigrations(url);
  const handle = createDb(url, { max: 5 });
  return {
    container,
    handle,
    url,
    stop: async () => {
      await handle.close();
      await container.stop();
    },
  };
}
