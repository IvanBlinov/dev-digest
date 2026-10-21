/**
 * PR Brief domain helpers (SPEC-03): post-validation (AC-23..AC-29), staleness (AC-7),
 * provenance (AC-30) and the 429 error (Q2). Pure functions, no DB.
 */
import { describe, it, expect } from 'vitest';
import type { BlastRadius } from '@devdigest/shared';
import {
  normalizeBriefPath,
  hunkHeaders,
  hunkRanges,
  allowedBriefFiles,
  validateBriefOutput,
  briefInputHash,
  briefStaleness,
  buildBriefProvenance,
  rateLimitError,
} from '../src/modules/brief/helpers.js';
import {
  MAX_SUMMARY_CHARS,
  MAX_RISKS,
  MAX_FOCUS,
  MAX_RISK_TITLE_CHARS,
  MAX_TEXT_CHARS,
  MAX_REF_CHARS,
} from '../src/modules/brief/constants.js';

const PATCH_A = ['@@ -1,3 +1,4 @@ function a()', ' ctx', '+added', ' ctx'].join('\n') + '\n@@ -20,2 +30,3 @@ b()\n x\n+y\n z';
const PATCH_DEL = '@@ -5,3 +0,0 @@ gone()\n-a\n-b\n-c';

const blast = (over: Partial<BlastRadius> = {}): BlastRadius => ({
  changed_symbols: [{ name: 'rateLimit', file: 'src/limiter.ts', kind: 'function' }],
  downstream: [
    {
      symbol: 'rateLimit',
      callers: [
        { name: 'handler', file: 'src/routes/pay.ts', line: 42 },
        { name: 'hook', file: 'src/hooks.ts', line: 7 },
      ],
      endpoints_affected: [],
      crons_affected: [],
    },
  ],
  summary: '1 symbol, 2 callers',
  ...over,
});

const files = [
  { path: 'src/a.ts', patch: PATCH_A },
  { path: 'src/gone.ts', patch: PATCH_DEL },
  { path: 'assets/logo.png', patch: null },
];

const risk = (over: Record<string, unknown> = {}) => ({
  kind: 'security',
  title: 'Auth surface touched',
  explanation: 'why',
  severity: 'high' as const,
  refs: [{ file: 'src/a.ts', start_line: 2, end_line: 3 }],
  ...over,
});
const focus = (file: string, line: number, reason = 'because') => ({ file, line, reason });
const out = (o: { summary?: string; risks?: unknown[]; review_focus?: unknown[] } = {}) =>
  ({ summary: 's', risks: [], review_focus: [], ...o }) as Parameters<typeof validateBriefOutput>[0];
const validate = (o: ReturnType<typeof out>, b: BlastRadius | null = null) =>
  validateBriefOutput(o, { files, blast: b });

describe('normalizeBriefPath', () => {
  it("AC-27: trims whitespace and one leading './'", () => {
    expect(normalizeBriefPath(' ./src/a.ts ')).toBe('src/a.ts');
    expect(normalizeBriefPath('src/a.ts')).toBe('src/a.ts');
    expect(normalizeBriefPath('././src/a.ts')).toBe('./src/a.ts');
  });

  it("AC-27: a ref written with './' matches a changed file; '../a' does not", () => {
    const r = validate(out({ risks: [risk({ refs: [{ file: ' ./src/a.ts', start_line: null, end_line: null }] })] }));
    expect(r.risks).toHaveLength(1);
    expect(r.risks[0]!.refs[0]!.file).toBe('src/a.ts');
    const bad = validate(out({ risks: [risk({ refs: [{ file: '../a', start_line: null, end_line: null }] })] }));
    expect(bad.risks).toHaveLength(0);
  });
});

describe('hunk parsing', () => {
  it('hunkHeaders: only @@ lines, at most 10, each at most 160 chars, null patch gives []', () => {
    const many = Array.from({ length: 14 }, (_, i) => `@@ -${i},1 +${i},1 @@ ${'x'.repeat(300)}\n+body${i}`).join('\n');
    const h = hunkHeaders(many);
    expect(h).toHaveLength(10);
    expect(h.every((l) => l.startsWith('@@') && l.length <= 160)).toBe(true);
    expect(hunkHeaders(null)).toEqual([]);
    expect(hunkHeaders(PATCH_A).join('\n')).not.toContain('added');
  });

  it('hunkRanges: new and old side ranges, a count-less header means one line', () => {
    expect(hunkRanges(PATCH_A)).toEqual({
      newRanges: [
        [1, 4],
        [30, 32],
      ],
      oldRanges: [
        [1, 3],
        [20, 21],
      ],
    });
    expect(hunkRanges('@@ -7 +9 @@ x\n-a\n+b').newRanges).toEqual([[9, 9]]);
    expect(hunkRanges(null)).toEqual({ newRanges: [], oldRanges: [] });
  });
});

describe('allowedBriefFiles', () => {
  it('AC-23: changed files plus changed-symbol files plus caller files', () => {
    const s = allowedBriefFiles(['src/a.ts'], blast());
    expect([...s].sort()).toEqual(['src/a.ts', 'src/hooks.ts', 'src/limiter.ts', 'src/routes/pay.ts']);
  });

  it('AC-23: with blast degraded, only the changed files are allowed', () => {
    const s = allowedBriefFiles(['src/a.ts'], blast({ degraded: true, reason: 'repo_too_large' }));
    expect([...s]).toEqual(['src/a.ts']);
    expect([...allowedBriefFiles(['src/a.ts'], null)]).toEqual(['src/a.ts']);
  });
});

describe('validateBriefOutput', () => {
  it('AC-23: a ref and a focus item on an invented path are dropped', () => {
    const r = validate(
      out({
        risks: [risk({ refs: [{ file: 'src/a.ts', start_line: 1, end_line: 2 }, { file: 'src/invented.ts', start_line: 1, end_line: 1 }] })],
        review_focus: [focus('src/invented.ts', 3), focus('src/a.ts', 2)],
      }),
    );
    expect(r.risks[0]!.refs.map((x) => x.file)).toEqual(['src/a.ts']);
    expect(r.review_focus.map((f) => f.file)).toEqual(['src/a.ts']);
  });

  it('AC-23: a caller file from the blast radius is allowed for a risk ref', () => {
    const r = validate(
      out({ risks: [risk({ refs: [{ file: 'src/routes/pay.ts', start_line: 42, end_line: 42 }] })] }),
      blast(),
    );
    expect(r.risks).toHaveLength(1);
  });

  it('AC-23: with blast degraded a caller file is not allowed', () => {
    const r = validate(
      out({ risks: [risk({ refs: [{ file: 'src/routes/pay.ts', start_line: 42, end_line: 42 }] })] }),
      blast({ degraded: true, reason: 'index_failed' }),
    );
    expect(r.risks).toHaveLength(0);
  });

  it('AC-24: a risk whose refs are all dropped is removed', () => {
    const r = validate(
      out({ risks: [risk({ title: 'keep' }), risk({ title: 'gone', refs: [{ file: 'nope.ts', start_line: null, end_line: null }] })] }),
    );
    expect(r.risks.map((x) => x.title)).toEqual(['keep']);
  });

  it('AC-25: a focus line inside a new-side hunk range is kept, one outside is dropped', () => {
    const r = validate(out({ review_focus: [focus('src/a.ts', 4), focus('src/a.ts', 31), focus('src/a.ts', 10), focus('src/a.ts', 33)] }));
    expect(r.review_focus.map((f) => f.line)).toEqual([4, 31]);
  });

  it('AC-25: a deleted file (no new-side lines) is checked against the old-side ranges', () => {
    const r = validate(out({ review_focus: [focus('src/gone.ts', 6), focus('src/gone.ts', 50)] }));
    expect(r.review_focus.map((f) => f.line)).toEqual([6]);
  });

  it('AC-25 / EC-10: patch:null drops the focus item but a risk ref to that file stays', () => {
    const r = validate(
      out({
        risks: [risk({ refs: [{ file: 'assets/logo.png', start_line: null, end_line: null }] })],
        review_focus: [focus('assets/logo.png', 1)],
      }),
    );
    expect(r.review_focus).toEqual([]);
    expect(r.risks).toHaveLength(1);
  });

  it('AC-25: a blast-only focus item is kept only when its line equals a caller line of that file', () => {
    const r = validate(out({ review_focus: [focus('src/routes/pay.ts', 42), focus('src/routes/pay.ts', 43)] }), blast());
    expect(r.review_focus.map((f) => f.line)).toEqual([42]);
  });

  it('AC-26: dropped counts only AC-23/24/25 drops', () => {
    const r = validate(
      out({
        risks: [risk(), risk({ refs: [{ file: 'nope.ts', start_line: null, end_line: null }] })],
        review_focus: [focus('src/a.ts', 2), focus('src/a.ts', 2), focus('nope.ts', 1), focus('src/a.ts', 99)],
      }),
    );
    // risks: the second loses all refs -> 1. focus: invented path + out-of-range line -> 2; the duplicate is not a drop
    expect(r.dropped).toEqual({ risks: 1, review_focus: 2 });
    expect(r.review_focus).toHaveLength(1);
  });

  it('AC-26: clamping surplus items is not counted as dropped', () => {
    const risks = Array.from({ length: MAX_RISKS + 3 }, (_, i) => risk({ title: `r${i}` }));
    const r = validate(out({ risks }));
    expect(r.risks).toHaveLength(MAX_RISKS);
    expect(r.dropped).toEqual({ risks: 0, review_focus: 0 });
  });

  it('AC-28: clamps summary, counts and text lengths', () => {
    expect(MAX_SUMMARY_CHARS).toBe(800);
    expect(MAX_RISKS).toBe(6);
    expect(MAX_FOCUS).toBe(8);
    expect(MAX_RISK_TITLE_CHARS).toBe(120);
    expect(MAX_TEXT_CHARS).toBe(400);
    const r = validate(
      out({
        summary: 's'.repeat(2000),
        risks: [risk({ title: 't'.repeat(500), explanation: 'e'.repeat(900) })],
        review_focus: [focus('src/a.ts', 2, 'r'.repeat(900))],
      }),
    );
    expect(r.summary.length).toBe(800);
    expect(r.risks[0]!.title.length).toBe(120);
    expect(r.risks[0]!.explanation.length).toBe(400);
    expect(r.review_focus[0]!.reason.length).toBe(400);
  });

  it('AC-28: at most 8 focus items; a duplicate file+line is kept once', () => {
    const items = [focus('src/a.ts', 2), focus('src/a.ts', 2, 'again'), ...[1, 3, 4, 30, 31, 32, 2].map((l) => focus('src/a.ts', l))];
    const r = validate(out({ review_focus: items }));
    expect(r.review_focus.length).toBeLessThanOrEqual(MAX_FOCUS);
    const keys = r.review_focus.map((f) => `${f.file}:${f.line}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(r.review_focus[0]!.reason).toBe('because');
  });

  it('AC-29: risks sort high -> medium -> low, ties keep model order; focus keeps model order', () => {
    const r = validate(
      out({
        risks: [
          risk({ title: 'l1', severity: 'low' }),
          risk({ title: 'h1', severity: 'high' }),
          risk({ title: 'm1', severity: 'medium' }),
          risk({ title: 'h2', severity: 'high' }),
          risk({ title: 'm2', severity: 'medium' }),
        ],
        review_focus: [focus('src/a.ts', 31), focus('src/a.ts', 2), focus('src/a.ts', 4)],
      }),
    );
    expect(r.risks.map((x) => x.title)).toEqual(['h1', 'h2', 'm1', 'm2', 'l1']);
    expect(r.review_focus.map((f) => f.line)).toEqual([31, 2, 4]);
  });
});

describe('staleness', () => {
  const stored = { prompt_version: 'brief-v1', head_sha: 'aaa', input_hash: briefInputHash('T', 'B') };
  const cur = { headSha: 'aaa', title: 'T', body: 'B', promptVersion: 'brief-v1' };

  it('AC-7: fresh when nothing changed', () => {
    expect(briefStaleness(stored, cur)).toBeNull();
  });

  it('AC-7: reasons come in order prompt_updated, head_moved, description_changed', () => {
    expect(briefStaleness(stored, { ...cur, title: 'T2' })).toBe('description_changed');
    expect(briefStaleness(stored, { ...cur, title: 'T2', headSha: 'bbb' })).toBe('head_moved');
    expect(briefStaleness(stored, { ...cur, title: 'T2', headSha: 'bbb', promptVersion: 'x' })).toBe('prompt_updated');
  });

  it('AC-7: the hash covers title and body only (not the prompt version) and is stable', () => {
    expect(briefInputHash('T', 'B')).toBe(briefInputHash('T', 'B'));
    expect(briefInputHash('T', 'B')).not.toBe(briefInputHash('T', 'B2'));
    expect(briefInputHash('T', 'B')).not.toBe(briefInputHash('T2', 'B'));
    expect(briefInputHash('ab', 'c')).not.toBe(briefInputHash('a', 'bc'));
    expect(briefInputHash('T', 'B')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('buildBriefProvenance', () => {
  const trim = {
    docsDropped: [],
    issuesDropped: [],
    issuesTruncated: false,
    descriptionTruncated: false,
    callersShown: 2,
    callersTotal: 2,
    headersDropped: false,
    filesShown: 300,
    filesTotal: 1240,
    totalTokens: 100,
  };
  const build = (over: Partial<Parameters<typeof buildBriefProvenance>[0]> = {}) =>
    buildBriefProvenance({
      intent: 'ok',
      blast: blast(),
      trim,
      body: 'a description',
      issues: [{ kind: 'issue', ref: '#471', status: 'ok' }],
      docs: [{ ref: 'specs/rate.md', status: 'ok' }],
      ...over,
    });
  const of = (list: ReturnType<typeof build>, kind: string) => list.filter((i) => i.kind === kind);

  it('AC-30: one entry per input, with the right statuses', () => {
    const list = build();
    expect(list.map((i) => i.kind).sort()).toEqual(['blast', 'files', 'intent', 'issue', 'pr_description', 'spec']);
    expect(of(list, 'intent')[0]!.status).toBe('ok');
    expect(of(list, 'blast')[0]!.status).toBe('ok');
    expect(of(list, 'pr_description')[0]!.status).toBe('ok');
    expect(of(list, 'issue')[0]).toMatchObject({ ref: '#471', status: 'ok' });
    expect(of(list, 'spec')[0]).toMatchObject({ ref: 'specs/rate.md', status: 'ok' });
  });

  it('AC-30: files carry shown/total and are truncated when cut', () => {
    expect(of(build(), 'files')[0]).toMatchObject({ status: 'truncated', shown: 300, total: 1240 });
    expect(of(build({ trim: { ...trim, filesShown: 5, filesTotal: 5 } }), 'files')[0]).toMatchObject({ status: 'ok', shown: 5, total: 5 });
  });

  it('AC-30 / AC-15 / AC-16: intent none -> missing, stale -> stale', () => {
    expect(of(build({ intent: 'none' }), 'intent')[0]!.status).toBe('missing');
    expect(of(build({ intent: 'stale' }), 'intent')[0]!.status).toBe('stale');
  });

  it('AC-30: blast unavailable / degraded with its reason', () => {
    expect(of(build({ blast: 'unavailable' }), 'blast')[0]!.status).toBe('unavailable');
    expect(of(build({ blast: blast({ degraded: true, reason: 'repo_too_large' }) }), 'blast')[0]).toMatchObject({
      status: 'degraded',
      reason: 'repo_too_large',
    });
  });

  it('AC-30: an empty description is missing, a trimmed one is truncated', () => {
    expect(of(build({ body: '  ' }), 'pr_description')[0]!.status).toBe('missing');
    expect(of(build({ trim: { ...trim, descriptionTruncated: true } }), 'pr_description')[0]!.status).toBe('truncated');
  });

  it('AC-30 / AC-20: a document dropped by the budget is over_budget; an unfetched issue is unavailable', () => {
    const list = build({
      trim: { ...trim, docsDropped: ['specs/big.md'] },
      docs: [
        { ref: 'specs/rate.md', status: 'ok' },
        { ref: 'specs/big.md', status: 'ok' },
      ],
      issues: [{ kind: 'issue', ref: '#9', status: 'timeout' }],
    });
    expect(of(list, 'spec').find((s) => s.ref === 'specs/big.md')!.status).toBe('over_budget');
    expect(of(list, 'spec').find((s) => s.ref === 'specs/rate.md')!.status).toBe('ok');
    expect(of(list, 'issue')[0]!.status).toBe('unavailable');
  });

  it('AC-30: refs are clipped to 200 chars', () => {
    expect(MAX_REF_CHARS).toBe(200);
    const list = build({ docs: [{ ref: 'specs/' + 'x'.repeat(500), status: 'ok' }] });
    expect(of(list, 'spec')[0]!.ref.length).toBeLessThanOrEqual(200);
  });
});

describe('rateLimitError', () => {
  it('Q2 / AC-35: a 429 rate_limited carrying only retry_after_s, rounded up', () => {
    const e = rateLimitError(30_500);
    expect(e.code).toBe('rate_limited');
    expect(e.statusCode).toBe(429);
    expect(e.details).toEqual({ retry_after_s: 31 });
  });
});
