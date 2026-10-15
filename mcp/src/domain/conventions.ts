import type { ConventionsState } from '@devdigest/shared';

export type ScanView = 'never' | 'running' | 'failed' | 'done';

export interface ConventionItem {
  id: string;
  category: string;
  rule: string;
  evidencePath: string;
  startLine: number | null;
  endLine: number | null;
  snippet: string;
  confidence: number;
  status: string;
}

export interface ConventionsView {
  repoName: string;
  scan: ScanView;
  indexed: boolean;
  items: ConventionItem[];
  total: number;
  remaining: number;
}

export function conventionsView(state: ConventionsState, limit: number): ConventionsView {
  const sorted = [...state.candidates].sort(
    (a, b) =>
      Number(b.status === 'accepted') - Number(a.status === 'accepted') ||
      b.confidence - a.confidence,
  );
  const items = sorted.slice(0, limit).map<ConventionItem>((c) => ({
    id: c.id,
    category: c.category,
    rule: c.rule,
    evidencePath: c.evidence_path,
    startLine: c.evidence_start_line,
    endLine: c.evidence_end_line,
    snippet: c.evidence_snippet,
    confidence: c.confidence,
    status: c.status,
  }));
  return {
    repoName: state.repo_name,
    scan: state.scan ? state.scan.status : 'never',
    indexed: state.indexed,
    items,
    total: sorted.length,
    remaining: sorted.length - items.length,
  };
}
