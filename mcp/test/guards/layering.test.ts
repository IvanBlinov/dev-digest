import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '../../src');

// ---- module reference extraction --------------------------------------------

interface Ref {
  /** The raw specifier as written. */
  spec: string;
  /** Specifier resolved to a path inside src (`domain/errors`), or null for packages. */
  internal: string | null;
  /** True when the reference is erased at runtime (`import type`, or all-`type` named imports). */
  typeOnly: boolean;
}

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function resolveInternal(fileRel: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  return posix.normalize(posix.join(posix.dirname(fileRel), spec)).replace(/\.(js|ts)$/, '');
}

function isTypeOnly(clause: string, typeKeyword: boolean): boolean {
  if (typeKeyword) return true;
  const named = /^\s*\{([\s\S]*)\}\s*$/.exec(clause);
  if (!named) return false;
  const items = (named[1] ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  return items.length > 0 && items.every((x) => x.startsWith('type '));
}

/** import/export ... from, side-effect imports, dynamic import() and require(). */
export function extractRefs(fileRel: string, source: string): Ref[] {
  const code = stripComments(source);
  const refs: Ref[] = [];
  const add = (spec: string, typeOnly: boolean) =>
    refs.push({ spec, internal: resolveInternal(fileRel, spec), typeOnly });

  for (const m of code.matchAll(/\b(?:import|export)\s+(type\s+)?([^'";]*?)\s*from\s*['"]([^'"]+)['"]/g)) {
    add(m[3] ?? '', isTypeOnly(m[2] ?? '', Boolean(m[1])));
  }
  for (const m of code.matchAll(/\bimport\s*['"]([^'"]+)['"]/g)) add(m[1] ?? '', false);
  for (const m of code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]/g)) add(m[1] ?? '', false);
  for (const m of code.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]/g)) add(m[1] ?? '', false);
  return refs;
}

// ---- rules --------------------------------------------------------------------

const SDK = /^@modelcontextprotocol\//;
const SHARED = '@devdigest/shared';

function layerOf(rel: string): string {
  const first = rel.split('/')[0] ?? '';
  return ['api', 'domain', 'services', 'tools', 'presenters'].includes(first) ? first : rel;
}

/** Allowlist per inner layer: a reference is legal only if this returns true. */
const ALLOW: Record<string, (r: Ref) => boolean> = {
  // api/ -> api/*, config (type), shared types
  api: (r) =>
    r.internal !== null
      ? layerOf(r.internal) === 'api' || (r.internal === 'config' && r.typeOnly)
      : r.spec === SHARED && r.typeOnly,
  // domain/ -> domain/*, shared types
  domain: (r) =>
    r.internal !== null ? layerOf(r.internal) === 'domain' : r.spec === SHARED && r.typeOnly,
  // services/ -> services/*, api/port (type), domain/*, shared types
  services: (r) =>
    r.internal !== null
      ? layerOf(r.internal) === 'services' ||
        layerOf(r.internal) === 'domain' ||
        (r.internal === 'api/port' && r.typeOnly)
      : r.spec === SHARED && r.typeOnly,
  // presenters/ -> presenters/* (text.ts etc.), domain types only, shared types
  presenters: (r) =>
    r.internal !== null
      ? layerOf(r.internal) === 'presenters' || (layerOf(r.internal) === 'domain' && r.typeOnly)
      : r.spec === SHARED && r.typeOnly,
};

/** Forbidden-list rules for tools/ (it legitimately uses the SDK, zod, services, presenters, log). */
function toolsViolation(r: Ref): string | null {
  if (r.internal === 'api/http-client') return 'tools must not import the HTTP client';
  if (r.internal === 'api/port') return 'tools must not import the API port';
  if (r.internal !== null && layerOf(r.internal) === 'domain' && !r.typeOnly && r.internal !== 'domain/errors') {
    return 'tools may import domain values only from domain/errors (use `import type` otherwise)';
  }
  return null;
}

const CODE_PATTERNS: Record<string, { pattern: RegExp; why: string }[]> = {
  tools: [
    { pattern: /(^|[^\w])api\./, why: 'tools must not call api.*' },
    { pattern: /\.api\./, why: 'tools must not call .api.*' },
  ],
  presenters: [{ pattern: /\bfetch\(/, why: 'no I/O in presenters' }],
  domain: [
    { pattern: /\bfetch\(/, why: 'no I/O in domain' },
    { pattern: /\bprocess\./, why: 'no process access in domain' },
    { pattern: /Date\.now\(/, why: 'time is injected' },
    { pattern: /new\s+Date\(/, why: 'time is injected' },
    { pattern: /Math\.random/, why: 'domain is deterministic' },
    { pattern: /\b(setTimeout|setInterval)\b/, why: 'no timers in domain' },
    { pattern: /from\s+['"]node:/, why: 'no node: modules in domain' },
  ],
};

export function violationsFor(file: string, source: string): string[] {
  const layer = layerOf(file);
  const out: string[] = [];
  const refs = extractRefs(file, source);
  const code = stripComments(source);

  for (const r of refs) {
    const at = `${file}: '${r.spec}'`;
    // package isolation (every layer)
    if (r.internal !== null && r.internal.startsWith('..')) out.push(`${at}: reaches outside mcp/src`);
    if (/^@devdigest\/(reviewer-core|ui)/.test(r.spec)) out.push(`${at}: mcp must not depend on ${r.spec}`);
    if (r.spec === SHARED && !r.typeOnly) out.push(`${at}: @devdigest/shared is type-only (import type / export type)`);
    if (/^node:/.test(r.spec) && layer === 'domain') out.push(`${at}: no node: modules in domain`);

    const allow = ALLOW[layer];
    if (allow && !allow(r)) out.push(`${at}: not allowed from ${layer}/ (see mcp/AGENTS.md dependency rule)`);
    if (layer === 'tools') {
      const v = toolsViolation(r);
      if (v) out.push(`${at}: ${v}`);
    }
  }
  for (const c of CODE_PATTERNS[layer] ?? []) {
    if (c.pattern.test(code)) out.push(`${file}: ${c.why}`);
  }
  if (/new\s+HttpDevDigestApi/.test(code) && file !== 'create-server.ts') {
    out.push(`${file}: HttpDevDigestApi may only be constructed in create-server.ts`);
  }
  return out;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('layering guard (AC12)', () => {
  const files = walk(SRC).map((p) => ({
    rel: relative(SRC, p).split('\\').join('/'),
    source: readFileSync(p, 'utf8'),
  }));

  it('finds source files in every layer', () => {
    for (const layer of ['api', 'tools', 'presenters', 'services', 'domain']) {
      expect(files.some((f) => f.rel.startsWith(`${layer}/`)), layer).toBe(true);
    }
  });

  it('no file breaks a dependency rule', () => {
    expect(files.flatMap((f) => violationsFor(f.rel, f.source))).toEqual([]);
  });

  it('HttpDevDigestApi is constructed nowhere but create-server.ts', () => {
    const offenders = files
      .filter((f) => /new\s+HttpDevDigestApi/.test(stripComments(f.source)))
      .map((f) => f.rel);
    expect(offenders).toEqual(['create-server.ts']);
  });
});

describe('layering guard catches violations (negative self-tests)', () => {
  const bad = (file: string, src: string) => violationsFor(file, src).length > 0;
  const good = (file: string, src: string) => violationsFor(file, src).length === 0;

  it('extractRefs sees every import form', () => {
    const src = `import a from './a'; import type { B } from './b'; import { type C } from './c';
      export { d } from './d'; import './side'; const e = await import('./e'); const f = require('./f');
      import {
        g,
      } from './g';`;
    const refs = extractRefs('tools/x.ts', src);
    expect(refs.map((r) => r.spec)).toEqual(['./a', './b', './c', './d', './g', './side', './e', './f']);
    expect(refs.filter((r) => r.typeOnly).map((r) => r.spec)).toEqual(['./b', './c']);
  });

  it('tools: http-client, port, api calls, domain values (but not errors / types)', () => {
    expect(bad('tools/x.ts', "import { H } from '../api/http-client';")).toBe(true);
    expect(bad('tools/x.ts', "import type { P } from '../api/port';")).toBe(true);
    expect(bad('tools/x.ts', 'await services.api.listRepos();')).toBe(true);
    expect(bad('tools/x.ts', "import { toReviewSummary } from '../domain/findings';")).toBe(true);
    expect(good('tools/x.ts', "import type { ReviewSummary } from '../domain/findings';")).toBe(true);
    expect(good('tools/x.ts', "import { RepoNotFoundError } from '../domain/errors';")).toBe(true);
    expect(good('tools/x.ts', "import { ApiError } from '../api/errors';")).toBe(true);
  });

  it('presenters: only presenters/* and domain types', () => {
    for (const spec of ['../tools/x', '../config', '../log', '../api/port', '../services/s', 'tools/x', '@modelcontextprotocol/sdk/x']) {
      expect(bad('presenters/x.ts', `import { v } from '${spec}';`), spec).toBe(true);
    }
    expect(bad('presenters/x.ts', "import { v } from '../domain/findings';")).toBe(true);
    expect(good('presenters/x.ts', "import type { v } from '../domain/findings'; import { t } from './text';")).toBe(true);
    expect(bad('presenters/x.ts', 'const r = fetch("x");')).toBe(true);
  });

  it('services: no config/log/api errors/tools/presenters/SDK/http-client; api/port is type-only', () => {
    for (const spec of ['../config', '../log', '../api/errors', '../api/http-client', '../tools/x', '../presenters/x', '@modelcontextprotocol/sdk/x']) {
      expect(bad('services/x.ts', `import { v } from '${spec}';`), spec).toBe(true);
    }
    expect(bad('services/x.ts', "import { DevDigestApi } from '../api/port';")).toBe(true);
    expect(good('services/x.ts', "import type { DevDigestApi } from '../api/port'; import { m } from '../domain/match';")).toBe(true);
  });

  it('domain: no inward-breaking imports, config/log, nor non-determinism', () => {
    for (const spec of ['../config', '../log', '../api/port', '../services/s', '../tools/t', '../presenters/p', 'node:fs']) {
      expect(bad('domain/x.ts', `import x from '${spec}';`), spec).toBe(true);
    }
    for (const snippet of ['Date.now()', 'new Date()', 'Math.random()', 'setTimeout(f, 1)', 'setInterval(f, 1)', 'process.env.X', 'fetch("u")']) {
      expect(bad('domain/x.ts', `const v = ${snippet};`), snippet).toBe(true);
    }
    expect(good('domain/x.ts', "import type { Agent } from '@devdigest/shared'; const t = Date.parse('2026-01-01');")).toBe(true);
  });

  it('api: must not import services/tools/presenters/domain/SDK', () => {
    for (const spec of ['../services/s', '../tools/t', '../presenters/p', '../domain/match', '@modelcontextprotocol/sdk/x']) {
      expect(bad('api/x.ts', `import x from '${spec}';`), spec).toBe(true);
    }
    expect(good('api/x.ts', "import type { Config } from '../config'; import { ApiError } from './errors';")).toBe(true);
  });

  it('package isolation and type-only shared, in any layer', () => {
    for (const spec of ['../../server/src/x', '../../../client/src/x', '../../reviewer-core/src/x', '../../e2e/x', '@devdigest/reviewer-core', '@devdigest/ui']) {
      expect(bad('create-server.ts', `import x from '${spec}';`), spec).toBe(true);
    }
    expect(bad('create-server.ts', "import { Severity } from '@devdigest/shared';")).toBe(true);
    expect(bad('create-server.ts', "export { Severity } from '@devdigest/shared';")).toBe(true);
    expect(good('create-server.ts', "export type { Severity } from '@devdigest/shared';")).toBe(true);
  });

  it('side-effect, dynamic and require() forms are caught', () => {
    expect(bad('domain/x.ts', "import '../api/http-client';")).toBe(true);
    expect(bad('domain/x.ts', "const m = await import('../services/s');")).toBe(true);
    expect(bad('domain/x.ts', "const m = require('../config');")).toBe(true);
  });

  it('HttpDevDigestApi outside create-server.ts, and comments are ignored', () => {
    expect(bad('services/x.ts', 'const a = new HttpDevDigestApi(c);')).toBe(true);
    expect(good('domain/x.ts', "// Date.now( and import x from '../api/port' are banned here\nexport const a = 1;")).toBe(true);
  });
});
