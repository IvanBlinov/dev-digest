import type { SmartDiffRole } from '@devdigest/shared';

/** Display order of the groups (also the order of the `SmartDiffRole` enum). */
export const ROLE_ORDER: readonly SmartDiffRole[] = ['core', 'tests', 'wiring', 'docs', 'boilerplate'];

/** A rule matches when ANY of its matchers hits. All matching is on the lowercased path. */
export interface ClassifyRule {
  role: SmartDiffRole;
  /** Exact basename. */
  basenames?: readonly string[];
  /** Basename ends with. */
  suffixes?: readonly string[];
  /** Basename starts with. */
  prefixes?: readonly string[];
  /** Basename starts with [0] and ends with [1]. */
  prefixSuffix?: readonly (readonly [string, string])[];
  /** Basename contains. */
  includes?: readonly string[];
  /** Any directory segment equals (a directory pattern matches at any depth). */
  segments?: readonly string[];
}

/**
 * Ordered: the first matching rule wins, no match = `core`.
 * Order is boilerplate, tests, wiring, docs. So `e2e/README.md` is "tests" (the `e2e` segment
 * fires before the docs suffix) and `.claude/**\/SKILL.md` is "wiring".
 */
export const CLASSIFY_RULES: readonly ClassifyRule[] = [
  {
    role: 'boilerplate',
    basenames: ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'bun.lockb', 'npm-shrinkwrap.json'],
    suffixes: ['.lock', '.snap', '.min.js', '.min.css', '.map'],
    includes: ['.generated.'],
    segments: ['dist', 'build', 'node_modules', '__snapshots__', '.next', 'coverage'],
  },
  {
    role: 'tests',
    includes: ['.test.', '.spec.'],
    segments: ['test', 'tests', '__tests__', 'e2e'],
  },
  {
    role: 'wiring',
    basenames: ['package.json', 'index.ts', 'index.js', 'dockerfile', '.gitignore', '.dockerignore'],
    prefixes: ['.env'],
    prefixSuffix: [
      ['tsconfig', '.json'],
      ['docker-compose', '.yml'],
      ['docker-compose', '.yaml'],
    ],
    includes: ['.config.'],
    segments: ['.github', '.claude', 'scripts'],
  },
  {
    role: 'docs',
    basenames: ['license', 'licence', 'notice'],
    suffixes: ['.md', '.mdx', '.rst', '.txt'],
    segments: ['docs', 'specs'],
  },
];
