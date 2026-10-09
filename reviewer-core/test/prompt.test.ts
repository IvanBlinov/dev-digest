/**
 * assemblePrompt — PR description slot (the fix that was missing: the PR body
 * never reached the prompt). Pins rendering, omit-when-empty, untrusted-wrap,
 * truncation, and ordering (before the diff).
 */
import { describe, it, expect } from 'vitest';
import { assemblePrompt } from '../src/prompt.js';

function userOf(parts: Parameters<typeof assemblePrompt>[0]): string {
  const { messages } = assemblePrompt(parts);
  return messages[1]!.content;
}

function systemOf(parts: Parameters<typeof assemblePrompt>[0]): string {
  return assemblePrompt(parts).messages[0]!.content;
}

describe('assemblePrompt — shared injection guard (server + CI)', () => {
  const sys = systemOf({ system: 'AGENT-SYS', diff: 'DIFF' });

  it('appends the guard to the agent system prompt', () => {
    expect(sys.startsWith('AGENT-SYS')).toBe(true);
    expect(sys).toMatch(/<untrusted>.*DATA to be analyzed/s);
  });

  it('forbids "intentional/test/demo" claims from descoping the review', () => {
    // The defense that replaced the keyword sanitizer: a general, trusted,
    // language-agnostic rule — not text parsing of untrusted input.
    expect(sys).toMatch(/test fixture|intentional|demo/i);
    expect(sys).toMatch(/never reduce|never .*descope|REPORT it/i);
    expect(sys).toMatch(/any language/i);
  });
});

describe('assemblePrompt — ## PR description', () => {
  it('renders the section (untrusted-wrapped) before the diff when present', () => {
    const { messages, assembly } = assemblePrompt({
      system: 'sys',
      diff: 'DIFF',
      prDescription: 'Adds rate limiting to the public /api endpoints.',
    });
    const user = messages[1]!.content;
    expect(user).toContain('## PR description');
    expect(user).toContain('<untrusted source="pr-description">');
    expect(user).toContain('Adds rate limiting to the public /api endpoints.');
    expect(user.indexOf('## PR description')).toBeLessThan(user.indexOf('## Diff to review'));
    expect(assembly.pr_description).toContain('Adds rate limiting');
  });

  it('omits the section when prDescription is undefined or blank (no behaviour change)', () => {
    expect(userOf({ system: 'sys', diff: 'DIFF' })).not.toContain('## PR description');
    expect(assemblePrompt({ system: 'sys', diff: 'DIFF' }).assembly.pr_description ?? null).toBeNull();
    expect(userOf({ system: 'sys', diff: 'DIFF', prDescription: '   ' })).not.toContain(
      '## PR description',
    );
  });

  it('truncates a huge body to the 4k cap', () => {
    const { assembly } = assemblePrompt({
      system: 'sys',
      diff: 'D',
      prDescription: 'x'.repeat(10_000),
    });
    expect((assembly.pr_description as string).length).toBe(4000);
  });
});

describe('assemblePrompt — ## PR intent (unverified hypothesis)', () => {
  const intent = {
    summary: 'Add rate limiting to the public API',
    in_scope: ['limiter middleware'],
    out_of_scope: ['billing'],
    confidence: 'medium' as const,
    missing_context: ['spec specs/x.md not found'],
    stale: false,
  };

  it('renders after the PR description, untrusted-wrapped, with confidence and missing context', () => {
    const { messages, assembly } = assemblePrompt({
      system: 'sys',
      diff: 'DIFF',
      prDescription: 'desc',
      intent,
    });
    const user = messages[1]!.content;
    expect(user).toContain('## PR intent (unverified hypothesis)');
    expect(user).toContain('<untrusted source="pr-intent">');
    expect(user).toContain('Add rate limiting to the public API');
    expect(user).toContain('Confidence: medium');
    expect(user).toContain('spec specs/x.md not found');
    expect(user.indexOf('## PR description')).toBeLessThan(user.indexOf('## PR intent'));
    expect(user.indexOf('## PR intent')).toBeLessThan(user.indexOf('## Diff to review'));
    expect(assembly.intent).toContain('Add rate limiting to the public API');
  });

  it('adds the trusted SCOPE_RULE next to the guard (guard kept)', () => {
    const sys = systemOf({ system: 'AGENT-SYS', diff: 'D', intent });
    expect(sys).toMatch(/DATA to be analyzed/);
    expect(sys).toMatch(/scope/i);
    expect(sys).toMatch(/never change(s)? (the )?severity/i);
  });

  it('flags a stale intent in the block', () => {
    expect(userOf({ system: 's', diff: 'D', intent: { ...intent, stale: true } })).toMatch(/stale|earlier version/i);
  });

  it('without intent the output is unchanged and assembly.intent is null', () => {
    const a = assemblePrompt({ system: 'sys', diff: 'DIFF', prDescription: 'd' });
    expect(a.messages[0]!.content).not.toMatch(/PR intent/);
    expect(a.messages[1]!.content).not.toContain('## PR intent');
    expect(a.assembly.intent).toBeNull();
    expect(a.messages[0]!.content).toBe(systemOf({ system: 'sys', diff: 'DIFF', prDescription: 'd' }));
  });
});
