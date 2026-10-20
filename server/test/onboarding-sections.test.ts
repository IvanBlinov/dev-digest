import { describe, it, expect } from 'vitest';
import { buildDeterministicSections } from '../src/modules/onboarding/sections.js';

/**
 * L05b S8 (red phase) — deterministic tour sections from index data (pure).
 *
 * Pinned interface (see the test report, "Needs from implementer"):
 *   buildDeterministicSections({ graph, fileFacts, chains, stack, services, index, indexEnabled })
 *     -> { sections: { architecture, critical_paths, reading_path }, known_paths, coverage, reasons }
 *   graph      = { files: {path, rank}[], edges: {from, to}[] }      (facade getOnboardingGraph)
 *   fileFacts  = { path, endpoints: string[], crons: string[] }[]    (facade getAllFileFacts)
 *   chains     = string[][]                                          (facade getCriticalPaths)
 *   index      = { status: 'full'|'partial'|'degraded'|'failed', filesIndexed, filesTotal: number|null,
 *                  bounded: number } | null   (null = no index state)
 */

type Graph = { files: { path: string; rank: number }[]; edges: { from: string; to: string }[] };
type FileFact = { path: string; endpoints: string[]; crons: string[] };

const FULL = { status: 'full' as const, filesIndexed: 7, filesTotal: 7, bounded: 0 };

const BASE_GRAPH: Graph = {
  files: [
    { path: 'src/app.ts', rank: 0.9 },
    { path: 'src/db.ts', rank: 0.7 },
    { path: 'src/util.ts', rank: 0.7 },
    { path: 'test/app.test.ts', rank: 0.95 },
    { path: 'src/types.d.ts', rank: 0.8 },
    { path: 'migrations/001.ts', rank: 0.85 },
    { path: 'vite.config.ts', rank: 0.6 },
  ],
  edges: [
    { from: 'src/app.ts', to: 'src/db.ts' },
    { from: 'src/app.ts', to: 'src/util.ts' },
    { from: 'src/util.ts', to: 'src/db.ts' },
  ],
};
const BASE_FACTS: FileFact[] = [{ path: 'src/app.ts', endpoints: ['GET /a', 'POST /b', 'GET /c'], crons: [] }];

function build(over: Record<string, unknown> = {}) {
  return buildDeterministicSections({
    graph: BASE_GRAPH,
    fileFacts: BASE_FACTS,
    chains: [] as string[][],
    stack: ['TypeScript', 'Fastify'],
    services: [] as string[],
    index: FULL,
    indexEnabled: true,
    ...over,
  });
}

const files = (rows: [string, number][]) => rows.map(([path, rank]) => ({ path, rank }));
const paths = (items: { path: string }[]) => items.map((i) => i.path);

describe('reading path (AC-35, AC-36, AC-37)', () => {
  it('AC-35: reading path = src/app.ts, src/db.ts, src/util.ts', () => {
    const { sections } = build();
    // rank desc, ties by path asc; test, .d.ts, migrations and config files excluded
    expect(paths(sections.reading_path.items)).toEqual(['src/app.ts', 'src/db.ts', 'src/util.ts']);
    expect(sections.reading_path.source).toBe('deterministic');
    expect(sections.reading_path.unavailable_reason).toBeNull();
  });

  it('AC-35: 12 eligible ranked files → exactly 8, the top 8 by rank', () => {
    const rows = Array.from({ length: 12 }, (_, i): [string, number] => [`src/f${String(i + 1).padStart(2, '0')}.ts`, 0.99 - i * 0.01]);
    const { sections } = build({
      graph: { files: files(rows), edges: [{ from: rows[0]![0], to: rows[1]![0] }] },
      fileFacts: [],
    });
    expect(paths(sections.reading_path.items)).toEqual(rows.slice(0, 8).map(([p]) => p));
  });

  it("AC-36: default why = 'Imported by 2 files' for src/db.ts and 'Imported by 1 file' for src/util.ts", () => {
    const { sections } = build();
    const why = Object.fromEntries(sections.reading_path.items.map((i) => [i.path, i]));
    expect(why['src/db.ts']!.why).toBe('Imported by 2 files');
    expect(why['src/util.ts']!.why).toBe('Imported by 1 file');
    expect(why['src/db.ts']!.why_source).toBe('deterministic');
  });

  it('AC-37: no edges → reading path unavailable with no_graph and items []', () => {
    const { sections } = build({ graph: { files: BASE_GRAPH.files, edges: [] } });
    expect(sections.reading_path.items).toEqual([]);
    expect(sections.reading_path.unavailable_reason).toBe('no_graph');
  });
});

describe('critical paths (AC-30, AC-31)', () => {
  it('AC-30: critical paths = endpoint/cron files ∪ getCriticalPaths chains (rank desc; excluded kinds dropped)', () => {
    const { sections } = build({
      fileFacts: [
        ...BASE_FACTS,
        { path: 'vite.config.ts', endpoints: ['GET /cfg'], crons: [] }, // config: excluded
      ],
      chains: [['src/app.ts', 'src/util.ts', 'src/db.ts'], ['test/app.test.ts']],
    });
    expect(paths(sections.critical_paths.items)).toEqual(['src/app.ts', 'src/db.ts', 'src/util.ts']);
    expect(sections.critical_paths.items.every((i) => i.reason === null)).toBe(true);
  });

  it('AC-30: a file with crons and no endpoints is a critical-path entry', () => {
    const graph: Graph = {
      files: files([
        ['src/jobs.ts', 0.5],
        ['src/a.ts', 0.6],
      ]),
      edges: [{ from: 'src/a.ts', to: 'src/jobs.ts' }],
    };
    const { sections } = build({ graph, fileFacts: [{ path: 'src/jobs.ts', endpoints: [], crons: ['0 * * * *'] }] });
    expect(paths(sections.critical_paths.items)).toEqual(['src/jobs.ts']);
    expect(sections.critical_paths.items[0]!.fact).toBe('1 cron · imported by 1 file');
  });

  it('AC-30: 9 candidate files → exactly 5, by rank desc then path asc', () => {
    const rows: [string, number][] = [
      ['src/c1.ts', 0.5],
      ['src/c2.ts', 0.5],
      ['src/c3.ts', 0.6],
      ['src/c4.ts', 0.6],
      ['src/c5.ts', 0.6],
      ['src/c6.ts', 0.7],
      ['src/c7.ts', 0.4],
      ['src/c8.ts', 0.3],
      ['src/c9.ts', 0.2],
    ];
    const { sections } = build({
      graph: { files: files(rows), edges: [{ from: 'src/c1.ts', to: 'src/c2.ts' }] },
      fileFacts: rows.map(([path]): FileFact => ({ path, endpoints: ['GET /x'], crons: [] })),
    });
    expect(paths(sections.critical_paths.items)).toEqual(['src/c6.ts', 'src/c3.ts', 'src/c4.ts', 'src/c5.ts', 'src/c1.ts']);
  });

  it("AC-31: fact = '3 endpoints · imported by 0 files' (singular forms: '1 endpoint', '1 cron', '1 file')", () => {
    const { sections } = build();
    expect(sections.critical_paths.items.find((i) => i.path === 'src/app.ts')!.fact).toBe('3 endpoints · imported by 0 files');

    const single = build({
      graph: {
        files: files([
          ['src/s.ts', 0.5],
          ['src/t.ts', 0.4],
        ]),
        edges: [{ from: 'src/t.ts', to: 'src/s.ts' }],
      },
      fileFacts: [{ path: 'src/s.ts', endpoints: ['GET /one'], crons: [] }],
    });
    expect(single.sections.critical_paths.items[0]!.fact).toBe('1 endpoint · imported by 1 file');
  });
});

describe('architecture overview (AC-27, AC-28, AC-29)', () => {
  const labelOf = (arch: { diagram: { nodes: { id: string; label: string; kind: string }[] } | null }, kind: string) =>
    (arch.diagram?.nodes ?? []).filter((n) => n.kind === kind).map((n) => n.label);

  it('AC-28: module and edge rules', () => {
    // every file sits under src/ → the single shared top-level dir is stripped: modules api, db, web
    const g: Graph = {
      files: files([
        ['src/api/a.ts', 0.9],
        ['src/api/b.ts', 0.8],
        ['src/db/c.ts', 0.7],
        ['src/db/d.ts', 0.6],
        ['src/web/e.ts', 0.5],
      ]),
      edges: [
        { from: 'src/api/a.ts', to: 'src/db/c.ts' },
        { from: 'src/api/a.ts', to: 'src/api/b.ts' }, // same module → no self edge
      ],
    };
    const { sections } = build({ graph: g, fileFacts: [] });
    const diagram = sections.architecture.diagram!;
    expect(labelOf(sections.architecture, 'module').sort()).toEqual(['api', 'db', 'web']);
    const labelById = Object.fromEntries(diagram.nodes.map((n) => [n.id, n.label]));
    expect(diagram.edges.map((e) => `${labelById[e.from]}->${labelById[e.to]}`)).toEqual(['api->db']);
  });

  it('AC-28: 10 top-level dirs → exactly 8 module nodes, the 8 with the highest summed rank', () => {
    const rows: [string, number][] = Array.from({ length: 10 }, (_, i): [string, number] => [`m${i}/x.ts`, (i + 1) / 20]);
    rows.push(['m0/extra.ts', 0.46]); // m0 sums to 0.51 and outranks m9 (0.50)
    const { sections } = build({
      graph: { files: files(rows), edges: [{ from: 'm0/x.ts', to: 'm1/x.ts' }] },
      fileFacts: [],
    });
    const modules = labelOf(sections.architecture, 'module');
    expect(modules).toHaveLength(8);
    expect(modules.sort()).toEqual(['m0', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9']);
  });

  it('AC-28: compose with 6 services → exactly 4 service nodes, the first 4 in file order', () => {
    const { sections } = build({ services: ['web', 'api', 'db', 'cache', 'queue', 'mail'] });
    expect(labelOf(sections.architecture, 'service')).toEqual(['web', 'api', 'db', 'cache']);
  });

  it('AC-29: empty graph → diagram null with no_graph', () => {
    const { sections } = build({ graph: { files: [], edges: [] }, fileFacts: [] });
    expect(sections.architecture.diagram).toBeNull();
    expect(sections.architecture.unavailable_reason).toBe('no_graph');
  });

  it("AC-27: the deterministic summary names the stack, the modules and 'N endpoints'", () => {
    const { sections } = build();
    expect(sections.architecture.source).toBe('deterministic');
    const text = sections.architecture.narrative;
    expect(text).toContain('TypeScript');
    expect(text).toContain('Fastify');
    expect(text).toContain('3 endpoints');
    expect(text).toContain('src');
  });
});

describe('degraded index, known paths and coverage (AC-44, AC-40, AC-45)', () => {
  const degradedCases: [string, Record<string, unknown>][] = [
    ['status degraded', { index: { ...FULL, status: 'degraded' } }],
    ['status failed', { index: { ...FULL, status: 'failed' } }],
    ['index state missing', { index: null }],
    ['REPO_INTEL_ENABLED off', { indexEnabled: false }],
  ];

  it.each(degradedCases)(
    'AC-44: index degraded, missing or flag off → reading path, critical paths and diagram unavailable with index_degraded (%s)',
    (_name, over) => {
      // the facade returns empty arrays when degraded
      const { sections, reasons } = build({ graph: { files: [], edges: [] }, fileFacts: [], ...over });
      expect(sections.reading_path.items).toEqual([]);
      expect(sections.reading_path.unavailable_reason).toBe('index_degraded');
      expect(sections.critical_paths.items).toEqual([]);
      expect(sections.critical_paths.unavailable_reason).toBe('index_degraded');
      expect(sections.architecture.diagram).toBeNull();
      expect(sections.architecture.unavailable_reason).toBe('index_degraded');
      expect(reasons).toContain('index_degraded');
    },
  );

  it('AC-40: known_paths = every path present in the facts', () => {
    const out = build({
      fileFacts: [...BASE_FACTS, { path: 'src/extra.ts', endpoints: ['GET /e'], crons: [] }],
      chains: [['src/app.ts', 'src/chain-only.ts']],
    });
    for (const p of [...BASE_GRAPH.files.map((f) => f.path), 'src/extra.ts', 'src/chain-only.ts']) {
      expect(out.known_paths).toContain(p);
    }
    expect(out.known_paths).not.toContain('src/ghost.ts');
    expect(new Set(out.known_paths).size).toBe(out.known_paths.length);
  });

  it('AC-45: index partial, or bounded > 0 → coverage.partial true and reason index_partial', () => {
    const partial = build({ index: { status: 'partial', filesIndexed: 4000, filesTotal: 5200, bounded: 0 } });
    expect(partial.coverage).toEqual({ files_indexed: 4000, files_total: 5200, partial: true });
    expect(partial.reasons).toContain('index_partial');

    const bounded = build({ index: { status: 'full', filesIndexed: 5000, filesTotal: 7000, bounded: 2000 } });
    expect(bounded.coverage.partial).toBe(true);
    expect(bounded.reasons).toContain('index_partial');

    const complete = build();
    expect(complete.coverage).toEqual({ files_indexed: 7, files_total: 7, partial: false });
    expect(complete.reasons).not.toContain('index_partial');
  });
});
