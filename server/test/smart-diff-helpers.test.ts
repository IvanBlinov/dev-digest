import { describe, it, expect } from 'vitest';
import { SmartDiff } from '@devdigest/shared';
import { buildSmartDiff, classifyFile } from '../src/modules/smart-diff/helpers.js';

const CASES: Record<string, string[]> = {
  boilerplate: [
    'pnpm-lock.yaml',
    'yarn.lock',
    'x.lock',
    'a/__tests__/__snapshots__/x.snap',
    'client/dist/a.js',
    'lib/x.generated.ts',
    'v.min.js',
  ],
  tests: ['src/a.test.tsx', 'server/test/x.it.test.ts', 'a.spec.ts', 'e2e/specs/09.flow.json', 'e2e/README.md'],
  wiring: [
    'package.json',
    'src/index.ts',
    'vitest.config.ts',
    'tsconfig.base.json',
    '.env.example',
    'docker-compose.yml',
    '.github/workflows/ci.yml',
    '.claude/skills/security/SKILL.md',
  ],
  docs: ['README.md', 'docs/adr.md', 'CHANGELOG.md', 'LICENSE'],
  core: ['src/config.ts', 'src/middleware/ratelimit.ts'],
};

describe('classifyFile', () => {
  for (const [role, paths] of Object.entries(CASES)) {
    it.each(paths)(`${role}: %s`, (path) => {
      expect(classifyFile(path)).toBe(role);
    });
  }

  it('normalises backslashes', () => {
    expect(classifyFile('client\\dist\\a.js')).toBe('boilerplate');
  });
});

describe('buildSmartDiff', () => {
  const files = [
    { path: 'pnpm-lock.yaml', additions: 31, deletions: 24 },
    { path: 'src/b.ts', additions: 5, deletions: 1 },
    { path: 'src/config.ts', additions: 4, deletions: 0 },
    { path: 'docs/x.md', additions: 2, deletions: 0 },
    { path: 'src/a.test.ts', additions: 10, deletions: 0 },
  ];

  it('groups in role order, omits empty roles, keeps input order inside a group', () => {
    const d = buildSmartDiff(files, []);
    expect(d.groups.map((g) => g.role)).toEqual(['core', 'tests', 'docs', 'boilerplate']);
    expect(d.groups[0]!.files.map((f) => f.path)).toEqual(['src/b.ts', 'src/config.ts']);
    expect(d.groups[0]!.files[0]).toMatchObject({ additions: 5, deletions: 1, finding_lines: [] });
  });

  it('finding_lines are sorted, unique and ignore paths that are not PR files', () => {
    const d = buildSmartDiff(files, [
      { file: 'src/config.ts', start_line: 12 },
      { file: 'src/config.ts', start_line: 12 },
      { file: 'src/config.ts', start_line: 3 },
      { file: 'not/in/pr.ts', start_line: 9 },
    ]);
    const cfg = d.groups[0]!.files.find((f) => f.path === 'src/config.ts')!;
    expect(cfg.finding_lines).toEqual([3, 12]);
    expect(JSON.stringify(d)).not.toContain('not/in/pr.ts');
  });

  it('split_suggestion totals add+del and proposes nothing', () => {
    expect(buildSmartDiff(files, []).split_suggestion).toEqual({
      too_big: false,
      total_lines: 31 + 24 + 6 + 4 + 2 + 10,
      proposed_splits: [],
    });
  });

  it('output passes the SmartDiff contract', () => {
    expect(() => SmartDiff.parse(buildSmartDiff(files, [{ file: 'src/b.ts', start_line: 1 }]))).not.toThrow();
  });
});
