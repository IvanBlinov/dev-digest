import type {
  Agent,
  BlastRadius,
  ConventionsState,
  FindingRecord,
  PrMeta,
  Repo,
  ReviewRecord,
  ReviewRunResponse,
  RunRequest,
  RunSummary,
} from '@devdigest/shared';
import type { DevDigestApi } from '../src/api/port';

// ---- fixture builders -------------------------------------------------------

export function repo(over: Partial<Repo> = {}): Repo {
  return {
    id: 'repo-1',
    workspace_id: 'ws-1',
    owner: 'acme',
    name: 'payments-api',
    full_name: 'acme/payments-api',
    default_branch: 'main',
    clone_path: null,
    last_polled_at: null,
    created_by: null,
    ...over,
  };
}

export function pr(over: Partial<PrMeta> = {}): PrMeta {
  return {
    id: 'pr-482',
    number: 482,
    title: 'Add refund endpoint',
    author: 'dev',
    branch: 'feat/refund',
    base: 'main',
    head_sha: 'abc123',
    additions: 10,
    deletions: 2,
    files_count: 3,
    status: 'needs_review',
    ...over,
  };
}

export function agent(over: Partial<Agent> = {}): Agent {
  return {
    id: 'agent-1',
    name: 'Security',
    description: 'Looks for security issues',
    provider: 'openai',
    model: 'gpt-4o',
    system_prompt: 'SECRET SYSTEM PROMPT',
    enabled: true,
    version: 1,
    strategy: 'single-pass',
    ci_fail_on: 'critical',
    repo_intel: true,
    ...over,
  } as Agent;
}

export function run(over: Partial<RunSummary> = {}): RunSummary {
  return {
    run_id: 'run-1',
    agent_id: 'agent-1',
    agent_name: 'Security',
    provider: 'openai',
    model: 'gpt-4o',
    status: 'running',
    error: null,
    duration_ms: null,
    tokens_in: null,
    tokens_out: null,
    findings_count: null,
    grounding: null,
    ran_at: '2026-10-13T10:00:00.000Z',
    score: null,
    blockers: null,
    cost_usd: null,
    ...over,
  };
}

export function finding(over: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: 'f-1',
    severity: 'WARNING',
    category: 'bug',
    title: 'Possible null deref',
    file: 'src/refund.ts',
    start_line: 10,
    end_line: 12,
    rationale: 'x may be undefined',
    suggestion: null,
    confidence: 0.8,
    review_id: 'rev-1',
    accepted_at: null,
    dismissed_at: null,
    ...over,
  };
}

export function review(over: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: 'rev-1',
    pr_id: 'pr-482',
    agent_id: 'agent-1',
    run_id: 'run-1',
    agent_name: 'Security',
    kind: 'review',
    verdict: 'comment',
    summary: 'Looks mostly fine',
    score: 80,
    model: 'gpt-4o',
    grounding: null,
    created_at: '2026-10-13T10:05:00.000Z',
    cost_usd: null,
    findings: [],
    ...over,
  };
}

export function conventionsState(over: Partial<ConventionsState> = {}): ConventionsState {
  return {
    repo_id: 'repo-1',
    repo_name: 'acme/payments-api',
    indexed: true,
    scan: null,
    candidates: [],
    ...over,
  };
}

export function blastRadius(over: Partial<BlastRadius> = {}): BlastRadius {
  return {
    changed_symbols: [
      { name: 'formatMoney', file: 'src/lib/money.ts', kind: 'function' },
      { name: 'parseMoney', file: 'src/lib/parse.ts', kind: 'function' },
    ],
    downstream: [
      {
        symbol: 'formatMoney',
        callers: [
          { name: 'refund', file: 'src/a.ts', line: 12 },
          { name: 'order', file: 'src/b.ts', line: 30 },
        ],
        endpoints_affected: ['GET /refunds'],
        crons_affected: ['0 * * * *'],
      },
    ],
    summary: '2 changed symbols, 2 callers, 1 endpoint, 1 cron',
    ...over,
  };
}

// ---- MockDevDigestApi -------------------------------------------------------

type Method = keyof DevDigestApi;

export interface MockFixtures {
  repos: Repo[];
  pulls: Record<string, PrMeta[]>;
  agents: Agent[];
  runs: Record<string, RunSummary[]>;
  reviews: Record<string, ReviewRecord[]>;
  conventions: Record<string, ConventionsState>;
  blast: Record<string, BlastRadius>;
  /** Overrides the default startReview response. */
  startReviewResult?: ReviewRunResponse;
}

/** In-memory DevDigestApi: fixtures, a `calls` log, and a `failWith` hook. */
export class MockDevDigestApi implements DevDigestApi {
  readonly calls: { method: Method; args: unknown[] }[] = [];
  private failures = new Map<Method, unknown>();
  readonly fixtures: MockFixtures;

  constructor(fixtures: Partial<MockFixtures> = {}) {
    this.fixtures = {
      repos: [],
      pulls: {},
      agents: [],
      runs: {},
      reviews: {},
      conventions: {},
      blast: {},
      ...fixtures,
    };
  }

  failWith(method: Method, error: unknown): this {
    this.failures.set(method, error);
    return this;
  }

  callsTo(method: Method): unknown[][] {
    return this.calls.filter((c) => c.method === method).map((c) => c.args);
  }

  private record(method: Method, args: unknown[]): void {
    this.calls.push({ method, args });
    if (this.failures.has(method)) throw this.failures.get(method);
  }

  async listRepos(): Promise<Repo[]> {
    this.record('listRepos', []);
    return this.fixtures.repos;
  }
  async listPulls(repoId: string): Promise<PrMeta[]> {
    this.record('listPulls', [repoId]);
    return this.fixtures.pulls[repoId] ?? [];
  }
  async listAgents(): Promise<Agent[]> {
    this.record('listAgents', []);
    return this.fixtures.agents;
  }
  async startReview(prId: string, body: RunRequest): Promise<ReviewRunResponse> {
    this.record('startReview', [prId, body]);
    if (this.fixtures.startReviewResult) return this.fixtures.startReviewResult;
    const targets = this.fixtures.agents.filter((a) =>
      body.agentId ? a.id === body.agentId : body.all ? a.enabled : false,
    );
    return {
      pr_id: prId,
      runs: targets.map((a, i) => ({ run_id: `run-${i + 1}`, agent_id: a.id, agent_name: a.name })),
      reviews: [],
    };
  }
  async listRuns(prId: string): Promise<RunSummary[]> {
    this.record('listRuns', [prId]);
    return this.fixtures.runs[prId] ?? [];
  }
  async listReviews(prId: string): Promise<ReviewRecord[]> {
    this.record('listReviews', [prId]);
    return this.fixtures.reviews[prId] ?? [];
  }
  async getConventions(repoId: string): Promise<ConventionsState> {
    this.record('getConventions', [repoId]);
    const state = this.fixtures.conventions[repoId];
    if (!state) throw new Error(`no conventions fixture for ${repoId}`);
    return state;
  }
  async getBlastRadius(prId: string): Promise<BlastRadius> {
    this.record('getBlastRadius', [prId]);
    const radius = this.fixtures.blast[prId];
    if (!radius) throw new Error(`no blast fixture for ${prId}`);
    return radius;
  }
}
