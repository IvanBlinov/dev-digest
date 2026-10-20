import type { ChatMessage } from '@devdigest/shared';
import { INJECTION_GUARD, wrapUntrustedStrict } from '../prompt.js';
import { measure, type PromptSection, type PromptSectionTrust, type SectionMeter } from '../prompt-manifest.js';
import { BRIEF_BUDGET, fitBriefBudget, type BriefTrimReport } from './budget.js';

/**
 * PR Brief prompt (SPEC-03). The input type has NO field for hunk bodies: files carry only
 * `@@ … @@` header lines (re-filtered here), and every piece of text that came from the PR
 * or the repo is fenced with `wrapUntrustedStrict` under INJECTION_GUARD.
 */
export const BRIEF_PROMPT_VERSION = 'brief-v1';

export interface BriefPromptFile {
  path: string;
  role: string;
  additions: number;
  deletions: number;
  /** `@@ -a,b +c,d @@ <fn>` lines only; anything else is dropped. */
  hunkHeaders: string[];
}

export interface BriefPromptIntent {
  summary: string;
  in_scope: string[];
  out_of_scope: string[];
  confidence: 'low' | 'medium' | 'high';
  stale: boolean;
}

export interface BriefPromptBlast {
  summary: string;
  degraded: boolean;
  reason?: string;
  changedSymbols: { name: string; file: string; kind: string }[];
  /** Highest rank first. */
  callers: { symbol: string; name: string; file: string; line: number }[];
}

export interface BriefPromptText {
  ref: string;
  text: string;
}

export interface BriefPromptInput {
  title: string;
  body: string;
  intent: BriefPromptIntent | null;
  blast: BriefPromptBlast | null;
  files: BriefPromptFile[];
  issues: BriefPromptText[];
  docs: BriefPromptText[];
}

export interface BriefPromptOptions {
  countTokens: (text: string) => number;
  meter?: SectionMeter;
}

const MAX_TITLE = 300;

const SYSTEM = `You write a brief of a pull request for the person who will review it. You do NOT review line by line.

Return JSON with:
- summary: 2-4 sentences, what the PR does and why.
- risks: up to 6 merge risks. Each has kind (short label), title, explanation, severity (high|medium|low) and refs (the files, with start_line and end_line or null, that show the risk).
- review_focus: up to 8 places to read first. Each has file, line (a line in the new version of the file) and reason.

Rules:
- Use only the facts given below. The files and callers listed are the only files you may cite; never invent a path or a line.
- Prefer few, concrete risks over many vague ones. Return empty lists when there is nothing to flag.
- No code is shown, only paths and hunk headers. Do not guess code content.`;

const clip = (s: string, n: number): string => (s.length > n ? s.slice(0, n) : s);
const oneLine = (s: string): string => s.replace(/[\r\n]+/g, ' ');
const label = (s: string): string => s.replace(/[^\w./#:@-]/g, '_').slice(0, 120);

function fileLines(files: BriefPromptFile[]): string {
  return files
    .map((f) => {
      const headers = f.hunkHeaders
        .filter((h) => h.startsWith('@@'))
        .slice(0, BRIEF_BUDGET.maxHeadersPerFile)
        .map((h) => `  ${clip(oneLine(h), BRIEF_BUDGET.maxHeaderChars)}`);
      return [`${oneLine(f.path)} (${oneLine(f.role)} +${f.additions} -${f.deletions})`, ...headers].join('\n');
    })
    .join('\n');
}

function intentText(i: BriefPromptIntent): string {
  const list = (items: string[]) => (items.length ? items.map((x) => `- ${x}`).join('\n') : '- (none)');
  const lines = [
    `Summary: ${i.summary}`,
    `Confidence: ${i.confidence}`,
    `In scope:\n${list(i.in_scope)}`,
    `Out of scope:\n${list(i.out_of_scope)}`,
  ];
  if (i.stale) lines.push('Note: the PR changed after this was derived (stale, earlier version).');
  return lines.join('\n');
}

function blastText(b: BriefPromptBlast): string {
  const lines = [`Summary: ${b.summary}`];
  if (b.degraded) lines.push(`Degraded: yes${b.reason ? ` (${b.reason})` : ''}`);
  if (b.changedSymbols.length > 0) {
    lines.push('Changed symbols:', ...b.changedSymbols.map((s) => `- ${s.name} (${s.kind}) in ${s.file}`));
  }
  if (b.callers.length > 0) {
    lines.push('Callers:', ...b.callers.map((c) => `- ${c.symbol} <- ${c.name} at ${c.file}:${c.line}`));
  }
  return lines.join('\n');
}

interface Section {
  name: string;
  text: string;
  source: string;
  trust: PromptSectionTrust;
}

function sectionsOf(input: BriefPromptInput): Section[] {
  const out: Section[] = [];
  const add = (name: string, text: string, source: string, trust: PromptSectionTrust = 'untrusted') =>
    out.push({ name, text: `${text}\n\n`, source, trust });

  add('task', 'Write the brief of this pull request.', 'reviewer-core', 'trusted');
  add('pr-title', `## PR title\n${wrapUntrustedStrict('pr-title', clip(input.title, MAX_TITLE))}`, 'pr');
  const body = input.body.trim();
  add('pr-description', `## PR description\n${wrapUntrustedStrict('pr-description', body || '(empty)')}`, 'pr');
  if (input.intent) {
    add('intent', `## Derived intent\n${wrapUntrustedStrict('intent', intentText(input.intent))}`, 'intent');
  }
  if (input.blast) {
    add('blast', `## Blast radius\n${wrapUntrustedStrict('blast', blastText(input.blast))}`, 'blast');
  }
  add(
    'changed-files',
    `## Changed files (paths and hunk headers only — no code)\n${wrapUntrustedStrict('changed-files', fileLines(input.files) || '(none)')}`,
    'diff-headers',
  );
  for (const i of input.issues) {
    const l = `issue-${label(i.ref)}`;
    add(l, `## Linked issue\n${wrapUntrustedStrict(l, `${i.ref}\n${i.text}`)}`, 'issue');
  }
  for (const d of input.docs) {
    const l = `doc:${label(d.ref)}`;
    add(l, `## Reference document\n${wrapUntrustedStrict(l, `${d.ref}\n${d.text}`)}`, 'doc');
  }
  return out;
}

const SYSTEM_FULL = `${SYSTEM}\n\n${INJECTION_GUARD}`;

function renderMessages(input: BriefPromptInput): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM_FULL },
    { role: 'user', content: sectionsOf(input).map((s) => s.text).join('') },
  ];
}

export function buildBriefMessages(
  input: BriefPromptInput,
  opts: BriefPromptOptions,
): { messages: ChatMessage[]; sections: PromptSection[]; trim: BriefTrimReport } {
  const render = (i: BriefPromptInput) =>
    renderMessages(i)
      .map((m) => m.content)
      .join('\n');
  const { input: fitted, trim } = fitBriefBudget(input, render, opts.countTokens);
  return {
    messages: renderMessages(fitted),
    sections: [
      measure('system:brief', 'reviewer-core', 'trusted', SYSTEM_FULL, opts.meter, SYSTEM_FULL),
      ...sectionsOf(fitted).map((s) => measure(s.name, s.source, s.trust, s.text, opts.meter)),
    ],
    trim,
  };
}
