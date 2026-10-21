/**
 * PR Brief budget + trim (SPEC-03). Pins AC-19 (sub-caps, total), AC-20 (trim order,
 * never trim intent / blast summary) and AC-21 (output cap). Fake counter: 1 token per char.
 */
import { describe, it, expect } from 'vitest';
import {
  buildBriefMessages,
  fitBriefBudget,
  BRIEF_BUDGET,
  BRIEF_MAX_OUTPUT_TOKENS,
  type BriefPromptInput,
  type BriefPromptFile,
} from '../src/index.js';

const countTokens = (t: string) => t.length;

const mkFile = (i: number, adds = 1, dels = 0, headers = 0): BriefPromptFile => ({
  path: `src/f${i}.ts`,
  role: 'core',
  additions: adds,
  deletions: dels,
  hunkHeaders: Array.from({ length: headers }, (_, h) => `@@ -${h + 1},1 +${h + 1},1 @@ f${i}h${h}`),
});

const base: BriefPromptInput = {
  title: 'T',
  body: 'body',
  intent: { summary: 'INTENT_SUMMARY', in_scope: ['a'], out_of_scope: ['b'], confidence: 'high', stale: false },
  blast: { summary: 'BLAST_SUMMARY_LINE', degraded: false, changedSymbols: [], callers: [] },
  files: [mkFile(1)],
  issues: [],
  docs: [],
};

// buildBriefMessages already fits the budget, so measuring through it would always read <= 12000.
// A zero-cost counter makes it a pure renderer: no description/issue/doc clipping and no
// over-budget trim (files/callers/headers stay inside their own caps in these inputs), so
// `render` shows the prompt BEFORE fitBriefBudget touches it. Sizes below are chars == tokens.
const render = (i: BriefPromptInput) => buildBriefMessages(i, { countTokens: () => 0 }).messages.map((m) => m.content).join('\n');
const allTokens = (i: BriefPromptInput) => countTokens(render(i));

const callers = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ symbol: 's', name: `c${i}`, file: `src/c${i}.ts`, line: i + 1 }));

describe('BRIEF_BUDGET', () => {
  it('AC-19: carries the spec numbers', () => {
    expect(BRIEF_BUDGET).toMatchObject({
      totalTokens: 12_000,
      specTokens: 4_000,
      issueTokens: 2_000,
      descriptionTokens: 1_500,
      maxFiles: 300,
      maxCallers: 50,
      maxHeadersPerFile: 10,
      maxHeaderChars: 160,
    });
  });

  it('AC-21: the output is bounded by 2000 tokens', () => {
    expect(BRIEF_MAX_OUTPUT_TOKENS).toBe(2000);
  });
});

describe('fitBriefBudget', () => {
  it('leaves an input under budget unchanged', () => {
    const { input, trim } = fitBriefBudget(base, render, countTokens);
    expect(input).toEqual(base);
    expect(trim.docsDropped).toEqual([]);
    expect(trim.issuesDropped).toEqual([]);
    expect(trim.issuesTruncated).toBe(false);
    expect(trim.descriptionTruncated).toBe(false);
    expect(trim.headersDropped).toBe(false);
    expect(trim.filesShown).toBe(1);
    expect(trim.filesTotal).toBe(1);
  });

  it('AC-19: spec documents are held to 4000 tokens (whole documents, last first)', () => {
    const docs = [
      { ref: 'specs/a.md', text: 'a'.repeat(2500) },
      { ref: 'specs/b.md', text: 'b'.repeat(2500) },
      { ref: 'specs/c.md', text: 'c'.repeat(1000) },
    ];
    const { input, trim } = fitBriefBudget({ ...base, docs }, render, countTokens);
    const total = input.docs.reduce((n, d) => n + countTokens(d.text), 0);
    expect(total).toBeLessThanOrEqual(BRIEF_BUDGET.specTokens);
    expect(input.docs.map((d) => d.ref)).toEqual(['specs/a.md', 'specs/c.md'].filter((r) => input.docs.some((d) => d.ref === r)));
    expect(trim.docsDropped).toContain('specs/b.md');
    expect(trim.docsDropped).not.toContain('specs/a.md');
  });

  it('AC-19: issue text is held to 2000 tokens', () => {
    const issues = [{ ref: '#1', text: 'i'.repeat(5000) }];
    const { input, trim } = fitBriefBudget({ ...base, issues }, render, countTokens);
    const total = input.issues.reduce((n, d) => n + countTokens(d.text), 0);
    expect(total).toBeLessThanOrEqual(BRIEF_BUDGET.issueTokens);
    expect(trim.issuesTruncated || trim.issuesDropped.length > 0).toBe(true);
  });

  it('AC-19: the description is held to 1500 tokens', () => {
    const { input, trim } = fitBriefBudget({ ...base, body: 'd'.repeat(5000) }, render, countTokens);
    expect(countTokens(input.body)).toBeLessThanOrEqual(BRIEF_BUDGET.descriptionTokens);
    expect(trim.descriptionTruncated).toBe(true);
  });

  it('AC-19: at most 300 files and 50 callers, with shown/total in the report', () => {
    const files = Array.from({ length: 1240 }, (_, i) => mkFile(i, (i % 7) + 1, 0));
    const blast = { ...base.blast!, callers: callers(120) };
    const { input, trim } = fitBriefBudget({ ...base, files, blast }, render, countTokens);
    expect(input.files.length).toBeLessThanOrEqual(BRIEF_BUDGET.maxFiles);
    expect(input.blast!.callers.length).toBeLessThanOrEqual(BRIEF_BUDGET.maxCallers);
    expect(trim.filesShown).toBe(input.files.length);
    expect(trim.filesTotal).toBe(1240);
    expect(trim.callersShown).toBe(input.blast!.callers.length);
    expect(trim.callersTotal).toBe(120);
  });

  it('AC-19: the capped files are the largest ones (the tail is the smallest +/-)', () => {
    const files = Array.from({ length: 400 }, (_, i) => mkFile(i, i, 0)); // f399 is the largest
    const { input } = fitBriefBudget({ ...base, files }, render, countTokens);
    const paths = new Set(input.files.map((f) => f.path));
    expect(paths.has('src/f399.ts')).toBe(true);
    expect(paths.has('src/f0.ts')).toBe(false);
  });

  it('AC-19: the final prompt over all messages stays within 12000 tokens', () => {
    const huge: BriefPromptInput = {
      ...base,
      body: 'b'.repeat(9000),
      docs: [{ ref: 'specs/a.md', text: 'a'.repeat(9000) }],
      issues: [{ ref: '#1', text: 'i'.repeat(9000) }],
      files: Array.from({ length: 300 }, (_, i) => mkFile(i, i + 1, 1, 10)),
      blast: { ...base.blast!, callers: callers(50) },
    };
    const { input, trim } = fitBriefBudget(huge, render, countTokens);
    expect(allTokens(input)).toBeLessThanOrEqual(BRIEF_BUDGET.totalTokens);
    expect(trim.totalTokens).toBeLessThanOrEqual(BRIEF_BUDGET.totalTokens);
  });

  // Measured overhead (render above): empty prompt + fences ~2150; a header-less file line ~24.6;
  // 50 callers ~1380; one 2-header file ~72; each doc/issue adds ~60-120 of fence.
  it('AC-20: over budget, whole documents go first (last first) before anything else is touched', () => {
    // 2150 + body 1400 + 100 files 2460 + 50 callers 1380 + issue 1900 + docs 4000 ~ 13.5k > 12k;
    // without the docs ~9.4k fits, so only documents have to go.
    const input0: BriefPromptInput = {
      ...base,
      body: 'x'.repeat(1400),
      docs: [
        { ref: 'specs/a.md', text: 'a'.repeat(3900) },
        { ref: 'specs/b.md', text: 'b'.repeat(100) },
      ],
      issues: [{ ref: '#1', text: 'i'.repeat(1900) }],
      files: Array.from({ length: 100 }, (_, i) => mkFile(i, 5, 1, 0)),
      blast: { ...base.blast!, callers: callers(50) },
    };
    expect(allTokens(input0)).toBeGreaterThan(BRIEF_BUDGET.totalTokens);
    const { input, trim } = fitBriefBudget(input0, render, countTokens);
    expect(allTokens(input)).toBeLessThanOrEqual(BRIEF_BUDGET.totalTokens);
    // the last document went first, and the issue text was not shortened before documents were gone
    expect(trim.docsDropped).toEqual(['specs/b.md', 'specs/a.md']);
    expect(trim.issuesTruncated).toBe(false);
    expect(trim.issuesDropped).toEqual([]);
    expect(trim.callersShown).toBe(50);
    expect(trim.filesShown).toBe(100);
  });

  it('AC-20: with documents gone, issue text is trimmed before callers', () => {
    // 2150 + body 1400 + 250 files 6150 + 50 callers 1380 + issue 1960 ~ 13.0k > 12k;
    // the ~1k excess is smaller than the issue text, so issues absorb it and callers stay.
    const input0: BriefPromptInput = {
      ...base,
      body: 'x'.repeat(1400),
      issues: [{ ref: '#1', text: 'i'.repeat(1900) }],
      files: Array.from({ length: 250 }, (_, i) => mkFile(i, 5, 1, 0)),
      blast: { ...base.blast!, callers: callers(50) },
    };
    expect(allTokens(input0)).toBeGreaterThan(BRIEF_BUDGET.totalTokens);
    const { input, trim } = fitBriefBudget(input0, render, countTokens);
    expect(allTokens(input)).toBeLessThanOrEqual(BRIEF_BUDGET.totalTokens);
    expect(trim.issuesTruncated || trim.issuesDropped.length > 0).toBe(true);
    expect(trim.callersShown).toBe(50);
  });

  it('AC-20: callers go tail first (lowest rank last in the list), before hunk headers', () => {
    // 2150 + body 1400 + 110 files x 2 headers 7880 + 50 callers 1380 ~ 12.8k > 12k;
    // the ~0.8k excess is about 30 callers, so callers absorb it and headers stay.
    const input0: BriefPromptInput = {
      ...base,
      body: 'x'.repeat(1400),
      files: Array.from({ length: 110 }, (_, i) => mkFile(i, 5, 1, 2)),
      blast: { ...base.blast!, callers: callers(50) },
    };
    expect(allTokens(input0)).toBeGreaterThan(BRIEF_BUDGET.totalTokens);
    const { input, trim } = fitBriefBudget(input0, render, countTokens);
    expect(allTokens(input)).toBeLessThanOrEqual(BRIEF_BUDGET.totalTokens);
    expect(trim.callersShown).toBeLessThan(50);
    // the head of the rank-ordered list survives
    expect(input.blast!.callers.map((c) => c.name)).toEqual(
      callers(50).slice(0, trim.callersShown).map((c) => c.name),
    );
    // headers were not touched while callers still had room to give
    expect(trim.headersDropped).toBe(false);
  });

  it('AC-20: hunk headers go next, then files (smallest +/- first)', () => {
    // Long paths (~40 extra chars): 300 files without headers ~ 300 x 65 = 19.5k > 12k, so
    // dropping the headers (300 x 10 lines, ~100k) is not enough and files must go too.
    const longFile = (i: number): BriefPromptFile => ({ ...mkFile(i, 100 + i, 0, 10), path: `src/${'p'.repeat(40)}/f${i}.ts` });
    const files = Array.from({ length: 300 }, (_, i) => longFile(i));
    const input0: BriefPromptInput = { ...base, files, blast: { ...base.blast!, callers: [] } };
    expect(allTokens(input0)).toBeGreaterThan(BRIEF_BUDGET.totalTokens);
    const { input, trim } = fitBriefBudget(input0, render, countTokens);
    expect(allTokens(input)).toBeLessThanOrEqual(BRIEF_BUDGET.totalTokens);
    expect(trim.headersDropped).toBe(true);
    expect(input.files.length).toBeLessThan(300);
    // smallest dropped first: the biggest file always survives
    expect(input.files.some((f) => f.path.endsWith('/f299.ts'))).toBe(true);
    expect(input.files.some((f) => f.path.endsWith('/f0.ts'))).toBe(false);
  });

  it('AC-20: intent and the blast summary line are never removed', () => {
    const files = Array.from({ length: 300 }, (_, i) => mkFile(i, 1000, 1000, 10));
    const input0: BriefPromptInput = {
      ...base,
      body: 'x'.repeat(5000),
      docs: [{ ref: 'specs/a.md', text: 'a'.repeat(9000) }],
      issues: [{ ref: '#1', text: 'i'.repeat(9000) }],
      files,
      blast: { ...base.blast!, callers: callers(50) },
    };
    const { input } = fitBriefBudget(input0, render, countTokens);
    expect(input.intent).toEqual(base.intent);
    expect(input.blast!.summary).toBe('BLAST_SUMMARY_LINE');
    expect(render(input)).toContain('INTENT_SUMMARY');
    expect(render(input)).toContain('BLAST_SUMMARY_LINE');
  });
});

describe('buildBriefMessages + budget', () => {
  it('AC-19: reports the trim and keeps the rendered prompt within the total', () => {
    const files = Array.from({ length: 500 }, (_, i) => mkFile(i, i + 1, 0, 10));
    const { messages, trim } = buildBriefMessages({ ...base, files }, { countTokens });
    const tokens = messages.reduce((n, m) => n + countTokens(m.content), 0);
    expect(tokens).toBeLessThanOrEqual(BRIEF_BUDGET.totalTokens);
    expect(trim.filesTotal).toBe(500);
    expect(trim.filesShown).toBeLessThanOrEqual(BRIEF_BUDGET.maxFiles);
  });
});
