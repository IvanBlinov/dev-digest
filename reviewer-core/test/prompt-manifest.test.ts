/**
 * assemblePrompt — section manifest (prompt.assembled logging). The manifest
 * describes the prompt (name, source, trust, size) and never carries its text.
 */
import { describe, it, expect } from 'vitest';
import { assemblePrompt, type PromptParts } from '../src/prompt.js';
import { PREVIEW_MAX_CHARS } from '../src/prompt-manifest.js';

const FULL: PromptParts = {
  system: 'AGENT-SYS-TEXT',
  task: 'Review PR #1 "TITLE-TEXT"',
  prDescription: 'PR-BODY-MARKER',
  intent: {
    summary: 'INTENT-SUMMARY',
    in_scope: ['a'],
    out_of_scope: [],
    confidence: 'high',
    missing_context: [],
    stale: false,
  },
  skills: ['SKILL-ONE', 'SKILL-TWO'],
  memory: ['MEM-ONE'],
  repoMap: 'REPO-MAP-TEXT',
  specs: ['SPEC-ONE', 'SPEC-TWO'],
  callers: 'CALLERS-TEXT',
  diff: 'DIFF-BODY-LINE stripeKey',
};

describe('assemblePrompt — sections manifest', () => {
  it('names every slot with source and trust', () => {
    const { sections } = assemblePrompt(FULL);
    expect(sections.map((s) => s.name)).toEqual([
      'system:agent',
      'system:guard',
      'system:scope-rule',
      'task',
      'pr-description',
      'pr-intent',
      'skill:0',
      'skill:1',
      'memory',
      'repo-map',
      'spec:0',
      'spec:1',
      'callers',
      'diff',
    ]);
    const by = Object.fromEntries(sections.map((s) => [s.name, s]));
    expect(by['system:agent']!.trust).toBe('trusted');
    expect(by['system:guard']!.trust).toBe('trusted');
    expect(by['task']!.trust).toBe('untrusted');
    expect(by['diff']!.trust).toBe('untrusted');
    expect(by['diff']!.source).toBe('diff');
  });

  it('omits absent slots (no intent, no optional parts)', () => {
    const names = assemblePrompt({ system: 's', diff: 'd' }).sections.map((s) => s.name);
    expect(names).toEqual(['system:agent', 'system:guard', 'diff']);
  });

  it('has only manifest keys and never contains section text', () => {
    const { sections } = assemblePrompt(FULL);
    const allowed = new Set(['name', 'source', 'trust', 'chars', 'tokens', 'sha256', 'preview']);
    for (const s of sections) {
      for (const k of Object.keys(s)) expect(allowed.has(k)).toBe(true);
    }
    const json = JSON.stringify(sections);
    for (const marker of ['DIFF-BODY-LINE', 'PR-BODY-MARKER', 'AGENT-SYS-TEXT', 'TITLE-TEXT', 'SKILL-ONE', 'SPEC-ONE', 'MEM-ONE', 'CALLERS-TEXT', 'REPO-MAP-TEXT', 'INTENT-SUMMARY']) {
      expect(json).not.toContain(marker);
    }
  });

  it('sums chars to the real message lengths', () => {
    for (const parts of [FULL, { system: 's', diff: 'd' }]) {
      const { sections, messages } = assemblePrompt(parts);
      const sum = sections.reduce((n, s) => n + s.chars, 0);
      expect(sum).toBe(messages[0]!.content.length + messages[1]!.content.length);
    }
  });

  it('uses the injected meter for tokens and sha256; absent without one', () => {
    const plain = assemblePrompt(FULL).sections;
    expect(plain.every((s) => s.tokens === undefined && s.sha256 === undefined)).toBe(true);
    const metered = assemblePrompt(FULL, {
      tokens: (t) => t.length,
      digest: (t) => `d${t.length}`,
    }).sections;
    for (const s of metered) {
      expect(s.tokens).toBeGreaterThan(0);
      expect(s.sha256).toBe(`d${s.tokens}`);
    }
  });

  it('previews only the constant guard and scope rule, capped', () => {
    const { sections } = assemblePrompt(FULL);
    const withPreview = sections.filter((s) => s.preview !== undefined).map((s) => s.name);
    expect(withPreview).toEqual(['system:guard', 'system:scope-rule']);
    for (const s of sections) {
      if (s.preview) expect(s.preview.length).toBeLessThanOrEqual(PREVIEW_MAX_CHARS);
    }
  });

  it('leaves the messages unchanged by the meter', () => {
    const a = assemblePrompt(FULL).messages;
    const b = assemblePrompt(FULL, { tokens: () => 1, digest: () => 'x' }).messages;
    expect(b).toEqual(a);
  });
});
