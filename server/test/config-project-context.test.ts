import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/platform/config.js';

const cfg = (env: Record<string, string>) => loadConfig(env as NodeJS.ProcessEnv);

describe('projectContextRoots', () => {
  it('AC-1: defaults to the specs/docs/insights globs and INSIGHTS.md', () => {
    expect(cfg({}).projectContextRoots).toEqual([
      '**/{specs,docs,insights}/**/*.md',
      '**/INSIGHTS.md',
    ]);
  });
  it('AC-1: PROJECT_CONTEXT_ROOTS is split on commas outside braces and trimmed', () => {
    expect(
      cfg({ PROJECT_CONTEXT_ROOTS: ' notes/**/*.md , {a,b}/**/*.md ,' }).projectContextRoots,
    ).toEqual(['notes/**/*.md', '{a,b}/**/*.md']);
  });
  it('AC-1: an empty value falls back to the default', () => {
    expect(cfg({ PROJECT_CONTEXT_ROOTS: '' }).projectContextRoots).toHaveLength(2);
  });
});
