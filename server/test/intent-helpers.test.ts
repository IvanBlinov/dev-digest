import { describe, it, expect } from 'vitest';
import {
  extractReferences,
  extractHunkHeaders,
  sanitizeRef,
  intentInputHash,
  deriveStaleness,
  clampClassification,
} from '../src/modules/intent/helpers.js';

const repo = { owner: 'acme', name: 'payments-api' };
const refs = (title: string, body: string) => extractReferences({ title, body, repo });

describe('extractReferences', () => {
  it('closing keyword, bare #N, same-repo owner/repo#N and issue URL → issues (deduped)', () => {
    const r = refs(
      'Add limiter',
      'Fixes: #471. Also see #12 and acme/payments-api#12 and https://github.com/acme/payments-api/issues/99?x=1',
    );
    // priority order: closing keywords, URLs, owner/repo#N, bare #N
    expect(r.issues).toEqual([471, 99, 12]);
  });

  it('other-repo issue → not_allowlisted, never fetched', () => {
    const r = refs('t', 'see other/repo#3');
    expect(r.issues).toEqual([]);
    expect(r.unresolved).toContainEqual({ kind: 'issue', ref: 'other/repo#3', status: 'not_allowlisted' });
  });

  it('repo-relative spec, plan-named doc and same-repo blob URL', () => {
    const r = refs('t', 'Spec: specs/L01-run-cost.md and docs/plan.md');
    expect(r.docs).toEqual([
      { path: 'specs/L01-run-cost.md', kind: 'spec' },
      { path: 'docs/plan.md', kind: 'plan' },
    ]);
    const b = refs('t', 'https://github.com/acme/payments-api/blob/main/docs/design-plan.md');
    expect(b.docs).toEqual([{ path: 'docs/design-plan.md', kind: 'plan' }]);
  });

  it('traversal and absolute paths → not_allowlisted', () => {
    const r = refs('t', 'read ../x.md and /etc/x.md');
    expect(r.docs).toEqual([]);
    expect(r.unresolved.map((u) => [u.ref, u.status])).toEqual([
      ['../x.md', 'not_allowlisted'],
      ['/etc/x.md', 'not_allowlisted'],
    ]);
  });

  it('ticket keys → unsupported; other hosts → not_allowlisted with the query stripped', () => {
    const r = refs('PROJ-123 thing', 'https://linear.app/x/issue/ABC-1?token=secret#frag');
    expect(r.unresolved).toContainEqual({ kind: 'link', ref: 'PROJ-123', status: 'unsupported' });
    expect(r.unresolved).toContainEqual({ kind: 'link', ref: 'linear.app/x/issue/ABC-1', status: 'not_allowlisted' });
    expect(JSON.stringify(r)).not.toContain('secret');
    expect(JSON.stringify(r)).not.toContain('token');
  });

  it('caps: at most 3 issues and 3 docs', () => {
    const r = refs('t', '#1 #2 #3 #4 #5 a/a.md b/b.md c/c.md d/d.md');
    expect(r.issues).toHaveLength(3);
    expect(r.docs).toHaveLength(3);
  });

  it('nothing to find in an empty description', () => {
    expect(refs('Plain title', '')).toEqual({ issues: [], docs: [], unresolved: [] });
  });
});

describe('sanitizeRef', () => {
  it('strips query, fragment and userinfo', () => {
    expect(sanitizeRef('https://user:pw@example.com/a/b?q=1#h')).toBe('example.com/a/b');
  });
});

describe('extractHunkHeaders', () => {
  const raw = [
    'diff --git a/src/a.ts b/src/a.ts',
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -1,2 +1,3 @@ function a()',
    ' context',
    '+const stripeKey = "x"',
    '@@ -10,2 +11,3 @@',
    '-old',
    'diff --git a/b.ts b/b.ts',
    '--- a/b.ts',
    '+++ b/b.ts',
    '@@ -1 +1 @@ ' + 'z'.repeat(400),
  ].join('\n');
  it('returns only @@ lines per file, truncated', () => {
    const h = extractHunkHeaders(raw);
    expect(h['src/a.ts']).toEqual(['@@ -1,2 +1,3 @@ function a()', '@@ -10,2 +11,3 @@']);
    expect(h['b.ts']![0]!.length).toBe(160);
    expect(JSON.stringify(h)).not.toContain('stripeKey');
  });
  it('at most 10 per file', () => {
    const many = ['diff --git a/x b/x', ...Array.from({ length: 30 }, (_, i) => `@@ -${i} +${i} @@`)].join('\n');
    expect(extractHunkHeaders(many)['x']).toHaveLength(10);
  });
});

describe('intentInputHash / deriveStaleness', () => {
  const cur = { headSha: 's1', title: 'T', body: 'B', promptVersion: 'v1' };
  const stored = { headSha: 's1', inputHash: intentInputHash(cur), promptVersion: 'v1' };

  it('hash is stable and changes with title, body or version', () => {
    expect(intentInputHash(cur)).toBe(intentInputHash({ ...cur }));
    const h = intentInputHash(cur);
    expect(intentInputHash({ ...cur, title: 'T2' })).not.toBe(h);
    expect(intentInputHash({ ...cur, body: 'B2' })).not.toBe(h);
    expect(intentInputHash({ ...cur, promptVersion: 'v2' })).not.toBe(h);
  });

  it('fresh → null; each reason is detected', () => {
    expect(deriveStaleness(stored, cur)).toBeNull();
    expect(deriveStaleness(stored, { ...cur, headSha: 's2' })).toBe('head_moved');
    expect(deriveStaleness(stored, { ...cur, body: 'changed' })).toBe('description_changed');
    expect(deriveStaleness(stored, { ...cur, promptVersion: 'v2' })).toBe('prompt_updated');
  });
});

describe('clampClassification', () => {
  it('enforces caps', () => {
    const c = clampClassification({
      summary: 's'.repeat(2000),
      in_scope: Array.from({ length: 20 }, () => 'i'.repeat(500)),
      out_of_scope: ['  ', 'ok'],
      confidence: 'high',
      missing_context: Array.from({ length: 30 }, (_, i) => `m${i}`),
    });
    expect(c.summary).toHaveLength(600);
    expect(c.in_scope).toHaveLength(8);
    expect(c.in_scope[0]).toHaveLength(200);
    expect(c.out_of_scope).toEqual(['ok']);
    expect(c.missing_context).toHaveLength(10);
    expect(c.confidence).toBe('high');
  });
});
