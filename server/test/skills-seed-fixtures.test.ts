import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';
import { DEMO_PRS } from '../src/db/seed-skills/demo-prs.js';
import { parseSkillUpload } from '../src/modules/skills/import.js';

const FIXTURE_DIR = new URL('../src/db/seed-skills/', import.meta.url);

describe('L02 seed fixtures', () => {
  it.each(DEMO_PRS.map((p) => [p.number, p] as const))('PR #%i patches parse like pr_files reconstruction', (_n, pr) => {
    const raw = pr.files
      .flatMap((f) => [`diff --git a/${f.path} b/${f.path}`, `--- a/${f.path}`, `+++ b/${f.path}`, f.patch])
      .join('\n');
    const diff = parseUnifiedDiff(raw);
    expect(diff.files.map((f) => f.path)).toEqual(pr.files.map((f) => f.path));
    diff.files.forEach((f, i) => {
      expect(f.hunks).toHaveLength(1);
      expect(f.additions).toBe(pr.files[i]!.additions);
      expect(f.deletions).toBe(pr.files[i]!.deletions);
    });
  });

  it('every skill fixture parses with frontmatter and no warnings', () => {
    const files = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.md'));
    expect(files).toHaveLength(8);
    for (const f of files) {
      const p = parseSkillUpload(f, new Uint8Array(readFileSync(new URL(f, FIXTURE_DIR))));
      expect(p.name).toBe(f.replace(/\.md$/, ''));
      expect(p.warnings).toEqual([]);
      expect(p.description.length).toBeGreaterThan(0);
    }
  });
});
