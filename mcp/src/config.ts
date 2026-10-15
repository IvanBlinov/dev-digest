import { z } from 'zod';

const DEFAULT_API_URL = 'http://localhost:3001';
const DEFAULT_TIMEOUT_MS = 15000;

const ConfigSchema = z.object({
  DEVDIGEST_API_URL: z
    .string()
    .url()
    .refine((u) => /^https?:\/\//i.test(u), 'must be an http(s) URL')
    .default(DEFAULT_API_URL),
  DEVDIGEST_TIMEOUT_MS: z.coerce.number().int().positive().default(DEFAULT_TIMEOUT_MS),
});

export interface Config {
  apiUrl: string;
  timeoutMs: number;
}

/** Some MCP clients pass `${VAR:-default}` from .mcp.json through unexpanded; treat that as unset. */
function clean(v: string | undefined): string | undefined {
  return v && !/^\$\{.*\}$/.test(v) ? v : undefined;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = ConfigSchema.safeParse({
    DEVDIGEST_API_URL: clean(env.DEVDIGEST_API_URL),
    DEVDIGEST_TIMEOUT_MS: clean(env.DEVDIGEST_TIMEOUT_MS),
  });
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid configuration - ${detail}`);
  }
  return {
    apiUrl: parsed.data.DEVDIGEST_API_URL.replace(/\/+$/, ''),
    timeoutMs: parsed.data.DEVDIGEST_TIMEOUT_MS,
  };
}
