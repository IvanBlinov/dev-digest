import type { RepoRef } from '@devdigest/shared';
import { MockGitClient } from '../../src/adapters/mocks.js';

/**
 * Test-only fixtures for the L05b onboarding tests (plain objects shaped like the
 * planned `OnboardingTour` contract; they import nothing that does not exist yet).
 */

/** A MockGitClient that records every readFile / listDir call and implements listDir itself. */
export class SpyGit extends MockGitClient {
  readonly readPaths: string[] = [];
  readonly listedDirs: string[] = [];
  private readonly fileMap: Record<string, string>;
  private readonly rootNames?: string[];
  private readonly throwOn: Set<string>;

  constructor(opts: { files?: Record<string, string>; root?: string[]; throwOn?: string[]; head?: string } = {}) {
    super({ files: opts.files ?? {}, head: opts.head });
    this.fileMap = opts.files ?? {};
    this.rootNames = opts.root;
    this.throwOn = new Set(opts.throwOn ?? []);
  }

  override async readFile(repo: RepoRef, path: string): Promise<string> {
    this.readPaths.push(path);
    if (this.throwOn.has(path)) throw new Error(`ENOENT: ${path}`);
    return super.readFile(repo, path);
  }

  async listDir(_repo: RepoRef, dir: string): Promise<string[]> {
    this.listedDirs.push(dir);
    if (dir !== '') return [];
    if (this.rootNames) return [...this.rootNames];
    return [...new Set(Object.keys(this.fileMap).map((p) => p.split('/')[0]!))].sort();
  }
}

export const REF: RepoRef = { owner: 'acme', name: 'demo' };

const PROMPT_VERSION = 'test-prompt-v0';

/** A valid `OnboardingTour` (status ready, five llm sections). */
export function makeTour(over: Record<string, unknown> = {}) {
  return {
    status: 'ready',
    index_sha: 'sha-1',
    prompt_version: PROMPT_VERSION,
    generated_at: '2026-10-19T10:00:00.000Z',
    coverage: { files_indexed: 6, files_total: 6, partial: false },
    reasons: [] as string[],
    known_paths: ['src/app.ts', 'src/db.ts', 'src/util.ts'],
    generation: {
      provider: 'openrouter',
      model: 'openai/gpt-4.1-mini',
      llm_calls: 1,
      tokens_in: 100,
      tokens_out: 50,
      cost_usd: 0.001,
      duration_ms: 5,
    },
    sections: {
      architecture: {
        source: 'llm',
        unavailable_reason: null,
        narrative: 'A small API.',
        diagram: { nodes: [{ id: 'src', label: 'src', kind: 'module' }], edges: [] },
      },
      critical_paths: {
        source: 'llm',
        unavailable_reason: null,
        items: [{ path: 'src/app.ts', fact: '3 endpoints · imported by 0 files', reason: 'Entry point' }],
      },
      run_commands: {
        source: 'llm',
        unavailable_reason: null,
        items: [{ id: 'install', command: 'pnpm install', comment: null, script_body: null }],
      },
      reading_path: {
        source: 'llm',
        unavailable_reason: null,
        items: [{ path: 'src/app.ts', why: 'Start here', why_source: 'llm' }],
      },
      first_tasks: {
        source: 'llm',
        unavailable_reason: null,
        items: [{ title: 'Add a route', description: 'Add GET /ping', paths: ['src/app.ts'] }],
      },
    },
    ...over,
  };
}

/** Sections shaped like the contract, deterministic base for the merge tests (S10). */
export function makeBaseSections() {
  return {
    architecture: {
      source: 'deterministic',
      unavailable_reason: null,
      narrative: 'Deterministic summary.',
      diagram: { nodes: [{ id: 'src', label: 'src', kind: 'module' }], edges: [] },
    },
    critical_paths: {
      source: 'deterministic',
      unavailable_reason: null,
      items: [
        { path: 'src/app.ts', fact: '3 endpoints · imported by 0 files', reason: null },
        { path: 'src/db.ts', fact: 'imported by 2 files', reason: null },
      ],
    },
    run_commands: {
      source: 'deterministic',
      unavailable_reason: null,
      items: [
        { id: 'install', command: 'pnpm install', comment: null, script_body: null },
        { id: 'script:dev', command: 'pnpm run dev', comment: null, script_body: 'vite' },
        { id: 'script:test', command: 'pnpm run test', comment: null, script_body: 'vitest run' },
      ],
    },
    reading_path: {
      source: 'deterministic',
      unavailable_reason: null,
      items: [
        { path: 'src/app.ts', why: 'Imported by 0 files', why_source: 'deterministic' },
        { path: 'src/db.ts', why: 'Imported by 2 files', why_source: 'deterministic' },
        { path: 'src/util.ts', why: 'Imported by 1 file', why_source: 'deterministic' },
      ],
    },
    first_tasks: { source: 'deterministic', unavailable_reason: null, items: [] },
  };
}

export const KNOWN_PATHS = ['src/app.ts', 'src/db.ts', 'src/util.ts'];

/** A valid `OnboardingNarrative` (the LLM schema), all parts empty unless overridden. */
export function makeNarrative(over: Record<string, unknown> = {}) {
  return {
    architecture: 'A small API.',
    critical_path_reasons: [] as { path: string; reason: string }[],
    commands: [] as { id: string; comment: string }[],
    reading_path: [] as { path: string; why: string }[],
    first_tasks: [] as { title: string; description: string; paths: string[] }[],
    ...over,
  };
}
