import type { OnboardingDiagram, OnboardingReason, OnboardingTour } from '@devdigest/shared';
import {
  ONBOARDING_MAX_CRITICAL_PATHS,
  ONBOARDING_MAX_DIAGRAM_MODULES,
  ONBOARDING_MAX_DIAGRAM_SERVICES,
  ONBOARDING_MAX_READING_PATH,
} from './constants.js';

/**
 * Deterministic tour sections from index data (pure). The LLM only decorates these later
 * (`mergeNarrative`); the facts, ordering and caps here never depend on a model.
 */

type Sections = OnboardingTour['sections'];

export interface OnboardingIndexInfo {
  status: 'full' | 'partial' | 'degraded' | 'failed';
  filesIndexed: number;
  filesTotal: number | null;
  bounded: number;
}

export interface DeterministicInput {
  graph: { files: { path: string; rank: number }[]; edges: { from: string; to: string }[] };
  fileFacts: { path: string; endpoints: string[]; crons: string[] }[];
  chains: string[][];
  stack: string[];
  services: string[];
  index: OnboardingIndexInfo | null;
  indexEnabled: boolean;
}

export interface DeterministicOutput {
  sections: Pick<Sections, 'architecture' | 'critical_paths' | 'reading_path'>;
  known_paths: string[];
  coverage: OnboardingTour['coverage'];
  reasons: OnboardingReason[];
}

const EXCLUDED_SEGMENTS = new Set(['test', 'tests', '__tests__', '__mocks__', 'migrations', 'node_modules', 'dist', 'build', 'generated', '.next']);

/** Tests, declaration files, migrations, configs and generated dirs never make the tour. */
export function isOnboardingExcluded(path: string): boolean {
  const segments = path.split('/');
  const file = segments[segments.length - 1] ?? '';
  if (segments.slice(0, -1).some((s) => EXCLUDED_SEGMENTS.has(s))) return true;
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(file)) return true;
  if (/\.d\.[cm]?ts$/.test(file)) return true;
  if (/(^|\.)config\.[cm]?[jt]s$/.test(file) || /^\.?[a-z-]*rc(\.[cm]?js|\.json)?$/.test(file)) return true;
  return false;
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function byRankThenPath(rank: Map<string, number>) {
  return (a: string, b: string) => (rank.get(b) ?? 0) - (rank.get(a) ?? 0) || (a < b ? -1 : a > b ? 1 : 0);
}

/** Module of a path: first segment after stripping one shared top-level dir. */
function moduleResolver(paths: string[]): (path: string) => string {
  const tops = new Set(paths.map((p) => (p.includes('/') ? p.split('/')[0]! : '')));
  const sharedTop = tops.size === 1 && !tops.has('') ? [...tops][0]! : null;
  return (path) => {
    const segs = path.split('/');
    if (sharedTop) return segs.length > 2 ? segs[1]! : sharedTop;
    return segs.length > 1 ? segs[0]! : '(root)';
  };
}

function buildDiagram(
  files: { path: string; rank: number }[],
  edges: { from: string; to: string }[],
  services: string[],
): { diagram: OnboardingDiagram | null; modules: string[] } {
  if (files.length === 0) return { diagram: null, modules: [] };
  const moduleOf = moduleResolver(files.map((f) => f.path));
  const sums = new Map<string, number>();
  for (const f of files) sums.set(moduleOf(f.path), (sums.get(moduleOf(f.path)) ?? 0) + f.rank);
  const modules = [...sums.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, ONBOARDING_MAX_DIAGRAM_MODULES)
    .map(([label]) => label);
  const kept = new Set(modules);
  const known = new Set(files.map((f) => f.path));

  const seen = new Set<string>();
  const outEdges: OnboardingDiagram['edges'] = [];
  for (const e of edges) {
    if (!known.has(e.from) || !known.has(e.to)) continue;
    const from = moduleOf(e.from);
    const to = moduleOf(e.to);
    if (from === to || !kept.has(from) || !kept.has(to)) continue;
    const key = `${from}>${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    outEdges.push({ from: `module:${from}`, to: `module:${to}` });
  }

  const nodes: OnboardingDiagram['nodes'] = [
    ...modules.map((label) => ({ id: `module:${label}`, label, kind: 'module' as const })),
    ...services.slice(0, ONBOARDING_MAX_DIAGRAM_SERVICES).map((label) => ({ id: `service:${label}`, label, kind: 'service' as const })),
  ];
  return { diagram: { nodes, edges: outEdges }, modules };
}

export function buildDeterministicSections(input: DeterministicInput): DeterministicOutput {
  const { graph, fileFacts, chains, stack, services, index, indexEnabled } = input;
  const degraded = !indexEnabled || index === null || index.status === 'degraded' || index.status === 'failed';
  const reasons: OnboardingReason[] = [];
  const unavailable: OnboardingReason | null = degraded ? 'index_degraded' : null;

  const rank = new Map(graph.files.map((f) => [f.path, f.rank]));
  const importers = new Map<string, Set<string>>();
  for (const e of graph.edges) {
    const set = importers.get(e.to) ?? new Set<string>();
    set.add(e.from);
    importers.set(e.to, set);
  }
  const importedBy = (p: string) => importers.get(p)?.size ?? 0;
  const cmp = byRankThenPath(rank);

  const eligible = graph.files.filter((f) => !isOnboardingExcluded(f.path));
  const noGraph = graph.files.length === 0;

  // reading path
  let readingReason: OnboardingReason | null = unavailable;
  let readingItems: Sections['reading_path']['items'] = [];
  if (!readingReason && (noGraph || graph.edges.length === 0)) readingReason = 'no_graph';
  if (!readingReason) {
    readingItems = eligible
      .map((f) => f.path)
      .sort(cmp)
      .slice(0, ONBOARDING_MAX_READING_PATH)
      .map((path) => ({
        path,
        why: `Imported by ${count(importedBy(path), 'file', 'files')}`,
        why_source: 'deterministic' as const,
      }));
  }

  // critical paths
  const factOf = new Map(fileFacts.map((f) => [f.path, f]));
  const candidates = new Set<string>();
  for (const f of fileFacts) if (f.endpoints.length + f.crons.length > 0) candidates.add(f.path);
  for (const chain of chains) for (const p of chain) candidates.add(p);
  let criticalReason: OnboardingReason | null = unavailable;
  if (!criticalReason && noGraph) criticalReason = 'no_graph';
  const criticalItems: Sections['critical_paths']['items'] = criticalReason
    ? []
    : [...candidates]
        .filter((p) => !isOnboardingExcluded(p))
        .sort(cmp)
        .slice(0, ONBOARDING_MAX_CRITICAL_PATHS)
        .map((path) => {
          const f = factOf.get(path);
          const parts: string[] = [];
          if (f && f.endpoints.length > 0) parts.push(count(f.endpoints.length, 'endpoint', 'endpoints'));
          if (f && f.crons.length > 0) parts.push(count(f.crons.length, 'cron', 'crons'));
          parts.push(`imported by ${count(importedBy(path), 'file', 'files')}`);
          return { path, fact: parts.join(' · '), reason: null };
        });

  // architecture
  const built = degraded ? { diagram: null, modules: [] as string[] } : buildDiagram(eligible, graph.edges, services);
  const diagram = built.diagram;
  const archReason: OnboardingReason | null = degraded ? 'index_degraded' : diagram ? null : 'no_graph';
  const endpointTotal = fileFacts.filter((f) => !isOnboardingExcluded(f.path)).reduce((n, f) => n + f.endpoints.length, 0);
  const summary = [
    stack.length > 0 ? `Stack: ${stack.join(', ')}.` : 'Stack not detected.',
    built.modules.length > 0 ? `Modules: ${built.modules.join(', ')}.` : null,
    services.length > 0 ? `Compose services: ${services.slice(0, ONBOARDING_MAX_DIAGRAM_SERVICES).join(', ')}.` : null,
    endpointTotal > 0 ? `${count(endpointTotal, 'endpoint', 'endpoints')} found.` : null,
  ]
    .filter((s): s is string => s !== null)
    .join(' ');

  // reasons and coverage
  for (const r of [archReason, readingReason, criticalReason]) {
    if (r && !reasons.includes(r)) reasons.push(r);
  }
  const partial = index !== null && (index.status === 'partial' || index.bounded > 0);
  if (partial) reasons.push('index_partial');

  const known = new Set<string>([...graph.files.map((f) => f.path), ...fileFacts.map((f) => f.path), ...chains.flat()]);

  return {
    sections: {
      architecture: { source: 'deterministic', unavailable_reason: archReason, narrative: summary, diagram },
      critical_paths: { source: 'deterministic', unavailable_reason: criticalReason, items: criticalItems },
      reading_path: { source: 'deterministic', unavailable_reason: readingReason, items: readingItems },
    },
    known_paths: [...known],
    coverage: { files_indexed: index?.filesIndexed ?? 0, files_total: index?.filesTotal ?? null, partial },
    reasons,
  };
}
