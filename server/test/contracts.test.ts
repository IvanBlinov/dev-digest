import { describe, it, expect } from 'vitest';
import {
  Review,
  Finding,
  Intent,
  PromptAssembly,
  BlastRadius,
  Risks,
  PrHistory,
  SmartDiff,
  Conformance,
  Onboarding,
  EvalRun,
  MemoryItem,
  RunTrace,
  RunStats,
  RunSummary,
  ReviewRecord,
  PrMeta,
  Settings,
  Repo,
  PrDetail,
} from '@devdigest/shared';

/**
 * Contract tests — parse/round-trip the fixtures from data.jsx/data2.jsx
 * so feature agents can rely on the schemas matching the prototype data.
 */
describe('AI contracts parse fixtures', () => {
  it('Review + Finding (data.jsx VERDICT/FINDINGS)', () => {
    const review = Review.parse({
      verdict: 'request_changes',
      summary: 'Two blockers before merge.',
      score: 61,
      findings: [
        {
          id: 'f1',
          severity: 'CRITICAL',
          category: 'security',
          title: 'Hardcoded Stripe secret key in commit',
          file: 'src/config.ts',
          start_line: 12,
          end_line: 12,
          rationale: 'Line 12 contains a literal `sk_live_` Stripe key.',
          suggestion: 'Move to env and rotate.',
          confidence: 0.98,
          kind: 'secret_leak',
        },
      ],
    });
    expect(review.findings).toHaveLength(1);
    expect(review.score).toBe(61);
  });

  it('lethal-trifecta Finding variant', () => {
    const f = Finding.parse({
      id: 'f2',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Lethal trifecta',
      file: 'src/api/public/webhooks.ts',
      start_line: 61,
      end_line: 74,
      rationale: 'all three legs present',
      confidence: 0.79,
      kind: 'lethal_trifecta',
      trifecta_components: ['private_data_access', 'untrusted_input', 'exfil_path'],
      evidence: [{ component: 'untrusted_input', file: 'src/api/public/webhooks.ts', line: 61 }],
    });
    expect(f.trifecta_components).toContain('exfil_path');
  });

  it('Intent / BlastRadius / Risks / PrHistory', () => {
    expect(() =>
      Intent.parse({
        summary: 'x',
        in_scope: ['a'],
        out_of_scope: ['b'],
        confidence: 'medium',
        sources: [{ kind: 'issue', ref: '#471', status: 'ok' }],
        missing_context: [],
      }),
    ).not.toThrow();
    // old shape (`intent:` field, no confidence/sources) is rejected
    expect(() => Intent.parse({ intent: 'x', in_scope: ['a'], out_of_scope: ['b'] })).toThrow();
    expect(() =>
      Intent.parse({
        summary: 'x',
        in_scope: [],
        out_of_scope: [],
        confidence: 'high',
        sources: [{ kind: 'issue', ref: '#1', status: 'maybe' }],
        missing_context: [],
      }),
    ).toThrow();
    expect(() =>
      BlastRadius.parse({
        changed_symbols: [{ name: 'rateLimit', file: 'a.ts', kind: 'function' }],
        downstream: [
          {
            symbol: 'rateLimit',
            callers: [{ name: 'publicRouter', file: 'b.ts', line: 23 }],
            endpoints_affected: ['GET /x'],
            crons_affected: ['c'],
          },
        ],
        summary: 's',
      }),
    ).not.toThrow();
    expect(() =>
      Risks.parse({
        risks: [{ kind: 'security', title: 't', explanation: 'e', severity: 'high', file_refs: [] }],
      }),
    ).not.toThrow();
    expect(() =>
      PrHistory.parse({
        history: [
          {
            pr_number: 401,
            title: 't',
            merged_at: '2026-03-18',
            author: 'a',
            files_overlap: [],
            notes: 'n',
          },
        ],
      }),
    ).not.toThrow();
  });

  it('SmartDiff (data.jsx DIFF)', () => {
    const d = SmartDiff.parse({
      groups: [
        {
          role: 'core',
          files: [{ path: 'a.ts', additions: 84, deletions: 0, finding_lines: [28, 52] }],
        },
      ],
      split_suggestion: { too_big: false, total_lines: 285, proposed_splits: [] },
    });
    expect(d.groups[0]!.role).toBe('core');
  });

  it('SmartDiff accepts the five roles and rejects unknown ones', () => {
    const file = { path: 'a.ts', additions: 1, deletions: 0, finding_lines: [] };
    const split = { too_big: false, total_lines: 1, proposed_splits: [] };
    const d = SmartDiff.parse({
      groups: [
        { role: 'tests', files: [file] },
        { role: 'docs', files: [file] },
      ],
      split_suggestion: split,
    });
    expect(d.groups.map((g) => g.role)).toEqual(['tests', 'docs']);
    expect(() => SmartDiff.parse({ groups: [{ role: 'misc', files: [file] }], split_suggestion: split })).toThrow();
  });

  it('Conformance / Onboarding / EvalRun / MemoryItem', () => {
    expect(() =>
      Conformance.parse({
        spec_id: 's1',
        spec_title: 'Spec',
        items: [{ requirement: 'r', status: 'implemented' }],
        completeness_pct: 80,
      }),
    ).not.toThrow();
    expect(() =>
      Onboarding.parse({
        sections: [{ kind: 'architecture', title: 'T', body: 'b', links: [] }],
      }),
    ).not.toThrow();
    expect(() =>
      EvalRun.parse({
        recall: 0.82,
        precision: 0.91,
        citation_accuracy: 0.95,
        traces_passed: 17,
        traces_total: 20,
        duration_ms: 12000,
        cost_usd: 0.23,
        per_trace: [{ name: 't01', pass: true, expected: 'x', actual: 'x' }],
      }),
    ).not.toThrow();
    expect(() =>
      MemoryItem.parse({
        content: 'c',
        scope: 'team',
        kind: 'decision',
        confidence: 0.92,
        sources: [{ pr: 401, context: 'ctx' }],
      }),
    ).not.toThrow();
  });

  it('RunTrace (data2.jsx TRACE single-document)', () => {
    const trace = RunTrace.parse({
      config: { agent: 'Security Reviewer', version: 'v7', model: 'gpt-4.1', pr: 482, source: 'local' },
      stats: { duration_ms: 8200, tokens_in: 14820, tokens_out: 1240, findings: 3, grounding: '3/3 passed' },
      prompt_assembly: { system: 's', user: 'u' },
      tool_calls: [{ tool: 'read_file', args: "'src/config.ts'", meta: '1,240 bytes', ms: 120 }],
      raw_output: '{}',
      memory_pulled: [{ pr: 288, text: 'verified via stripe-signature' }],
      specs_read: ['specs/security-baseline.md'],
      log: [{ t: '00.00', kind: 'info', msg: 'started' }],
    });
    expect(trace.tool_calls).toHaveLength(1);
  });

  it('L03d RunTrace.config.correlation_id is nullish and typed string', () => {
    const base = {
      config: { agent: 'a', model: 'm' },
      stats: { duration_ms: 1, tokens_in: 1, tokens_out: 1, findings: 0, grounding: '0/0 passed' },
      prompt_assembly: { system: 's', user: 'u' },
      tool_calls: [],
      raw_output: '{}',
      memory_pulled: [],
      specs_read: [],
      log: [],
    };
    expect(RunTrace.parse(base).config.correlation_id).toBeUndefined();
    expect(RunTrace.parse({ ...base, config: { ...base.config, correlation_id: 'abc' } }).config.correlation_id).toBe('abc');
    expect(() => RunTrace.parse({ ...base, config: { ...base.config, correlation_id: 5 } })).toThrow();
  });

  it('L01 cost_usd: optional on RunStats (pre-L01 traces), required-nullable on run/review rows', () => {
    const stats = { duration_ms: 1, tokens_in: 1, tokens_out: 1, findings: 0, grounding: '0/0 passed' };
    expect(RunStats.parse(stats).cost_usd).toBeUndefined();
    expect(RunStats.parse({ ...stats, cost_usd: 0.0123 }).cost_usd).toBeCloseTo(0.0123);
    expect(RunStats.parse({ ...stats, cost_usd: null }).cost_usd).toBeNull();

    const run = {
      run_id: 'r', agent_id: null, agent_name: null, provider: null, model: null, status: 'done', error: null,
      duration_ms: 1, tokens_in: 1, tokens_out: 1, findings_count: 0, grounding: '0/0', ran_at: null, score: null, blockers: null,
    };
    expect(() => RunSummary.parse(run)).toThrow();
    expect(RunSummary.parse({ ...run, cost_usd: null }).cost_usd).toBeNull();

    const review = {
      id: 'v', pr_id: 'p', agent_id: null, run_id: null, kind: 'review', verdict: null, summary: null, score: null,
      model: null, created_at: '2026-09-17T00:00:00.000Z', findings: [],
    };
    expect(() => ReviewRecord.parse(review)).toThrow();
    expect(ReviewRecord.parse({ ...review, cost_usd: 0.5 }).cost_usd).toBe(0.5);

    expect(PrMeta.parse({ number: 1, title: 't', author: 'a', branch: 'b', base: 'main', head_sha: 'x', additions: 0, deletions: 0, files_count: 0, status: 'needs_review' }).cost_usd).toBeUndefined();
  });
});

describe('platform DTOs', () => {
  it('Settings defaults + passthrough', () => {
    const s = Settings.parse({ extra_key: 'x' });
    expect(s.theme).toBe('dark');
    expect((s as Record<string, unknown>).extra_key).toBe('x');
  });

  it('Repo + PrDetail', () => {
    expect(() =>
      Repo.parse({
        id: 'r1',
        workspace_id: 'w1',
        owner: 'acme',
        name: 'payments-api',
        full_name: 'acme/payments-api',
        default_branch: 'main',
        clone_path: null,
        last_polled_at: null,
        created_by: null,
      }),
    ).not.toThrow();
    expect(() =>
      PrDetail.parse({
        number: 482,
        title: 't',
        author: 'a',
        branch: 'b',
        base: 'main',
        head_sha: 'sha',
        additions: 1,
        deletions: 0,
        files_count: 1,
        status: 'open',
        files: [],
        commits: [],
      }),
    ).not.toThrow();
  });
});

describe('intent layer contracts', () => {
  const base = {
    id: 'f1',
    severity: 'WARNING',
    category: 'bug',
    title: 't',
    file: 'a.ts',
    start_line: 1,
    end_line: 2,
    rationale: 'r',
    confidence: 0.5,
  };
  it('Finding.scope is optional and limited to in|out', () => {
    expect(() => Finding.parse(base)).not.toThrow();
    expect(Finding.parse({ ...base, scope: 'out' }).scope).toBe('out');
    expect(Finding.parse({ ...base, scope: null }).scope).toBeNull();
    expect(() => Finding.parse({ ...base, scope: 'both' })).toThrow();
  });
  it('PromptAssembly parses without intent', () => {
    expect(PromptAssembly.parse({ system: 's', user: 'u' }).intent).toBeUndefined();
    expect(PromptAssembly.parse({ system: 's', user: 'u', intent: 'x' }).intent).toBe('x');
  });
});
