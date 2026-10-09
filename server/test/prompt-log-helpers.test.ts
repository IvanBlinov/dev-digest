import { describe, it, expect } from 'vitest';
import type { PromptSection } from '@devdigest/reviewer-core';
import { redactLogValue } from '../src/platform/redact.js';
import {
  buildPromptAssembledEvent,
  promptSummaryLine,
  makeMeter,
  sha12,
} from '../src/platform/prompt-log.js';

const UUID = '3f2b8c1e-9a4d-4e57-8b21-0c6d5e7f1a90';

describe('redactLogValue', () => {
  it('reduces URLs to host+path', () => {
    expect(redactLogValue('https://u:p@h.io/a?token=X#f')).toBe('h.io/a');
    expect(redactLogValue('see https://h.io/x/?k=v and more')).toBe('see h.io/x and more');
  });

  it('masks secret-like tokens', () => {
    for (const s of [
      // Built at runtime so no literal looks like a real credential to secret scanners.
      ['sk', 'live', 'abcdef1234567890'].join('_'),
      ['sk', 'proj', 'abcdef1234567890'].join('-'),
      'ghp' + '_' + 'abcdefghijklmnopqrstuvwxyz0123456789',
      'github' + '_pat_' + '11ABCDEFG0abcdefgh',
      ['xoxb', '123', '456', 'abc'].join('-'),
      'AKIA' + 'ABCDEFGHIJKLMNOP',
      'Bearer abc.def-ghi',
      'A'.repeat(45),
    ]) {
      const out = redactLogValue(`x ${s} y`);
      expect(out).toContain('[redacted]');
      expect(out).not.toContain(s.slice(-12));
    }
  });

  it('leaves UUIDs, short digests and plain text alone', () => {
    expect(redactLogValue(UUID)).toBe(UUID);
    expect(redactLogValue('0123456789ab')).toBe('0123456789ab');
    expect(redactLogValue('skill:security-review')).toBe('skill:security-review');
  });
});

const sections: PromptSection[] = [
  { name: 'system:agent', source: 'agent-config', trust: 'trusted', chars: 10, tokens: 3, sha256: 'aaaaaaaaaaaa' },
  { name: 'system:guard', source: 'reviewer-core', trust: 'trusted', chars: 100, tokens: 20, sha256: 'bbbbbbbbbbbb', preview: 'GUARD PREVIEW' },
  { name: 'skill:0', source: 'skills', trust: 'trusted', chars: 50, tokens: 12 },
  { name: 'diff', source: 'diff', trust: 'untrusted', chars: 5000, tokens: 1500 },
];
const diff = {
  raw: '',
  files: [
    { path: 'src/a.ts', additions: 3, deletions: 1, hunks: [{}, {}] },
    { path: 'src/b.ts', additions: 2, deletions: 0, hunks: [{}] },
  ],
} as never;
const input = {
  correlationId: UUID,
  runId: 'r1',
  prId: 'p1',
  agent: 'sec',
  provider: 'openai',
  model: 'gpt-4.1',
  promptKind: 'review' as const,
  mode: 'map-reduce' as const,
  chunk: { index: 1, total: 5, file: 'src/a.ts' },
  sections,
  diff,
  skillBlocks: [{ name: 'my-skill', version: 2, tokens: 12 }],
};

describe('buildPromptAssembledEvent', () => {
  it('verbose off: no digests, previews, file names or skills detail', () => {
    const e = buildPromptAssembledEvent(input, { verbose: false });
    const json = JSON.stringify(e);
    expect(json).not.toContain('aaaaaaaaaaaa');
    expect(json).not.toContain('GUARD PREVIEW');
    expect(json).not.toContain('src/a.ts');
    expect(e.diffFiles).toBeUndefined();
    expect(e.skills).toBeUndefined();
    expect(e.chunk).toEqual({ index: 1, total: 5 });
    expect(e.diffStats).toEqual({ files: 2, additions: 5, deletions: 1, hunks: 3 });
    expect(e.totals).toEqual({ sections: 4, chars: 5160, tokens: 1535 });
    expect(e.sections.map((s) => s.name)).toEqual(['system:agent', 'system:guard', 'skill:my-skill', 'diff']);
    expect(e.correlationId).toBe(UUID);
  });

  it('verbose on: digests, previews, files and skills present', () => {
    const e = buildPromptAssembledEvent(input, { verbose: true });
    expect(e.sections[0]!.sha256).toBe('aaaaaaaaaaaa');
    expect(e.sections[1]!.preview).toBe('GUARD PREVIEW');
    expect(e.diffFiles).toEqual(['src/a.ts', 'src/b.ts']);
    expect(e.skills).toEqual([{ name: 'my-skill', version: 2, tokens: 12 }]);
    expect(e.chunk).toEqual({ index: 1, total: 5, file: 'src/a.ts' });
  });

  it('redacts every string (e.g. a URL query in a source)', () => {
    const e = buildPromptAssembledEvent(
      { ...input, sections: [{ name: 'doc:x', source: 'https://h.io/d?k=URLQUERYSECRET', trust: 'untrusted', chars: 1 }] },
      { verbose: false },
    );
    expect(JSON.stringify(e)).not.toContain('URLQUERYSECRET');
    expect(e.sections[0]!.source).toBe('h.io/d');
  });

  it('never has a text/content key and does not mutate input', () => {
    const before = JSON.stringify(input);
    const e = buildPromptAssembledEvent(input, { verbose: true });
    expect(JSON.stringify(e)).not.toMatch(/"(text|content)"\s*:/);
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe('promptSummaryLine', () => {
  it('formats sections, tokens, model and chunk', () => {
    const e = buildPromptAssembledEvent({ ...input, sections: Array.from({ length: 9 }, (_, i) => ({ name: `s${i}`, source: 'x', trust: 'trusted' as const, chars: 1, tokens: i === 0 ? 12300 : 0 })) }, { verbose: false });
    expect(promptSummaryLine(e)).toBe('Prompt: 9 sections, ~12.3k tokens, model gpt-4.1 (chunk 2/5)');
    const e2 = buildPromptAssembledEvent({ ...input, chunk: undefined, sections: [{ name: 'a', source: 'x', trust: 'trusted', chars: 1, tokens: 812 }] }, { verbose: false });
    expect(promptSummaryLine(e2)).toBe('Prompt: 1 sections, ~812 tokens, model gpt-4.1');
  });
});

describe('meter', () => {
  it('sha12 is 12 hex chars; makeMeter memoizes and gates digests on verbose', () => {
    expect(sha12('abc')).toMatch(/^[0-9a-f]{12}$/);
    let n = 0;
    const tk = { count: (t: string) => (n++, t.length) };
    const m = makeMeter(tk as never, false);
    expect(m.tokens!('abcd')).toBe(4);
    expect(m.tokens!('abcd')).toBe(4);
    expect(n).toBe(1);
    expect(m.digest).toBeUndefined();
    expect(makeMeter(tk as never, true).digest!('abc')).toBe(sha12('abc'));
  });
});
