import type { FindingItem, FindingsPage, ReviewSummary, RunRef } from '../domain/findings';
import {
  CATEGORY_MAX,
  HINT_RESERVE,
  MAX_RESPONSE_CHARS,
  NAME_MAX,
  PATH_MAX,
  capItems,
  fenceUntrusted,
  oneLine,
} from './text';

export type ResponseFormat = 'concise' | 'detailed';

const FIELD_MAX = 1200;
const SUMMARY_MAX = 600;
const TITLE_MAX = 200;

export interface FindingsPresentation {
  label: string;
  reviews: ReviewSummary[];
  running: RunRef[];
  page: FindingsPage | null;
}

function reviewsHeader(reviews: ReviewSummary[]): string {
  const parts = reviews.map(
    (r) => `${oneLine(r.agentName, NAME_MAX)}: ${r.verdict ?? 'no verdict'}${r.score === null ? '' : `, ${r.score}`}`,
  );
  return `${reviews.length} review(s) (${parts.join('; ')})`;
}

function renderItem(f: FindingItem, n: number, format: ResponseFormat): string {
  const line = `${n}. [${f.severity}] ${oneLine(f.category, CATEGORY_MAX)} · ${oneLine(f.file, PATH_MAX)}:${f.startLine}-${f.endLine} · ${oneLine(f.title, TITLE_MAX)} (${oneLine(f.agentName, NAME_MAX)})`;
  if (format === 'concise') return line;
  const extra = [fenceUntrusted(f.rationale, FIELD_MAX)];
  if (f.suggestion) extra.push(`   suggestion:\n${fenceUntrusted(f.suggestion, FIELD_MAX)}`);
  return `${line}\n${extra.join('\n')}`;
}

export function presentFindings(input: FindingsPresentation, format: ResponseFormat): string {
  const running = input.running.length
    ? `\nStill running: ${input.running
        .map((r) => `${oneLine(r.agentName, NAME_MAX)} (run_id ${r.runId}, ~${r.ageSec}s)`)
        .join('; ')}. Call get_findings again later for their results.`
    : '';

  if (!input.page || input.reviews.length === 0) {
    return `No review findings yet for ${input.label}. Start a review with run_review.${running}`;
  }

  const p = input.page;
  const first = p.items.length ? p.offset + 1 : 0;
  const dismissed = p.dismissedCount > 0 ? ` · ${p.dismissedCount} dismissed (hidden)` : '';
  const header = [
    `${input.label} · ${reviewsHeader(input.reviews)} · ${p.total} findings (${p.counts.critical}/${p.counts.warning}/${p.counts.suggestion} critical/warning/suggestion)${dismissed}`,
  ];
  if (format === 'detailed') {
    for (const r of input.reviews) {
      if (r.summary) header.push(`${oneLine(r.agentName, NAME_MAX)} summary:\n${fenceUntrusted(r.summary, SUMMARY_MAX)}`);
    }
  }
  const headerText = header.join('\n');
  const budget = MAX_RESPONSE_CHARS - headerText.length - running.length - HINT_RESERVE;
  const { text, rendered } = capItems(p.items, (f, i) => renderItem(f, p.offset + i + 1, format), budget);

  const shown = rendered ? `showing ${first}–${p.offset + rendered}` : 'showing none';
  const nextOffset = p.offset + rendered;
  const more = p.total - nextOffset;
  const hint = more > 0 ? `\n${more} more — call again with offset=${nextOffset}` : '';
  return `${headerText} · ${shown}\n${text}${hint}${running}`;
}
