import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INSTRUCTIONS } from '../../src/instructions';
import { connect } from '../helpers/connect';

type Tools = Awaited<ReturnType<Awaited<ReturnType<typeof connect>>['client']['listTools']>>['tools'];

let tools: Tools;
let instructions: string | undefined;
let close: () => Promise<void>;

beforeAll(async () => {
  const c = await connect();
  tools = (await c.client.listTools()).tools;
  instructions = c.client.getInstructions();
  close = c.close;
});
afterAll(() => close());

const EXPECTED_ANNOTATIONS: Record<string, Record<string, boolean>> = {
  list_agents: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  run_review: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  get_findings: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  get_conventions: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  get_blast_radius: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
};

describe('tools/list contract', () => {
  it('exposes exactly the five tools, verb-first snake_case', () => {
    expect(tools.map((t) => t.name).sort()).toEqual(
      ['get_blast_radius', 'get_conventions', 'get_findings', 'list_agents', 'run_review'],
    );
    for (const t of tools) expect(t.name).toMatch(/^(list|run|get)_[a-z_]+$/);
  });

  it('has titles, annotations, object roots without anyOf/oneOf, no _meta/outputSchema', () => {
    for (const t of tools) {
      expect(t.title, t.name).toBeTruthy();
      expect(t.annotations, t.name).toMatchObject(EXPECTED_ANNOTATIONS[t.name] ?? {});
      expect(t.inputSchema.type).toBe('object');
      expect(t.inputSchema).not.toHaveProperty('anyOf');
      expect(t.inputSchema).not.toHaveProperty('oneOf');
      expect((t as { _meta?: unknown })._meta).toBeUndefined();
      expect((t as { outputSchema?: unknown }).outputSchema).toBeUndefined();
    }
  });

  it('list_agents takes no arguments and forbids extras', () => {
    const t = tools.find((x) => x.name === 'list_agents');
    expect(t?.inputSchema.additionalProperties).toBe(false);
    expect(Object.keys(t?.inputSchema.properties ?? {})).toEqual([]);
  });

  it('initialize returns the instructions', () => {
    expect(instructions).toBe(INSTRUCTIONS);
  });
});

describe('startup budget', () => {
  it('instructions <= 600 chars, each description <= 350, tools JSON <= 7000', () => {
    const json = JSON.stringify(tools).length;
    const maxDesc = Math.max(...tools.map((t) => (t.description ?? '').length));
    // Visible with `npx vitest run test/guards/tools-list.test.ts --reporter=verbose`.
    console.info(`[budget] instructions=${INSTRUCTIONS.length} maxDescription=${maxDesc} toolsJson=${json}`);
    expect(INSTRUCTIONS.length).toBeLessThanOrEqual(600);
    for (const t of tools) expect((t.description ?? '').length, t.name).toBeLessThanOrEqual(350);
    expect(json).toBeLessThanOrEqual(7000);
  });
});

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('shared contracts are type-only', () => {
  it('no src file has a value import from @devdigest/shared', () => {
    const offenders = walk(join(__dirname, '../../src')).filter((f) =>
      /^import\s+(?!type\s)[^;]*from\s+['"]@devdigest\/shared/m.test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
