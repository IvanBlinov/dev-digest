import { createHash } from 'node:crypto';
import type { PromptSection, SectionMeter } from '@devdigest/reviewer-core';
import type { UnifiedDiff } from '@devdigest/shared';
import type { Tokenizer } from '../adapters/tokenizer/index.js';
import { redactLogValue } from './redact.js';

/**
 * `prompt.assembled` — one structured pino event per prompt build. It carries
 * a CONTENT-FREE manifest (section names, sources, trust, sizes) and never any
 * prompt text, diff, PR/spec/issue text or secret. Verbose mode (config.ts,
 * never in production) only adds a short digest and constant-section previews
 * authored by reviewer-core, plus file/skill names.
 */
export const PROMPT_ASSEMBLED_MSG = 'prompt.assembled';

const MAX_DIFF_FILES = 200;

export interface SkillBlockInfo {
  name: string;
  version?: string | number | null;
  tokens?: number;
}

export interface PromptAssembledInput {
  correlationId: string;
  runId?: string;
  prId: string;
  agent?: string;
  provider: string;
  model: string;
  promptKind: 'review' | 'intent';
  promptVersion?: string;
  mode?: 'single-pass' | 'map-reduce';
  chunk?: { index: number; total: number; file: string };
  sections: readonly PromptSection[];
  diff?: UnifiedDiff;
  skillBlocks?: readonly SkillBlockInfo[];
}

export interface PromptEventSection {
  name: string;
  source: string;
  trust: 'trusted' | 'untrusted';
  chars: number;
  tokens?: number;
  sha256?: string;
  preview?: string;
}

export interface PromptAssembledEvent {
  correlationId: string;
  runId?: string;
  prId: string;
  agent?: string;
  provider: string;
  model: string;
  promptKind: 'review' | 'intent';
  promptVersion?: string;
  mode?: 'single-pass' | 'map-reduce';
  chunk?: { index: number; total: number; file?: string };
  sections: PromptEventSection[];
  totals: { sections: number; chars: number; tokens: number };
  diffStats?: { files: number; additions: number; deletions: number; hunks: number };
  diffFiles?: string[];
  skills?: { name: string; version?: string | number | null; tokens?: number }[];
}

const r = redactLogValue;

/** Short, non-reversible digest for change detection in verbose logs. */
export function sha12(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 12);
}

/** Token counter + (verbose only) digest, memoized per run so repeated chunks cost one count. */
export function makeMeter(tokenizer: Tokenizer, verbose: boolean): SectionMeter {
  const tokenMemo = new Map<string, number>();
  const digestMemo = new Map<string, string>();
  return {
    tokens: (text) => {
      const hit = tokenMemo.get(text);
      if (hit !== undefined) return hit;
      const n = tokenizer.count(text);
      tokenMemo.set(text, n);
      return n;
    },
    ...(verbose
      ? {
          digest: (text: string) => {
            const hit = digestMemo.get(text);
            if (hit !== undefined) return hit;
            const d = sha12(text);
            digestMemo.set(text, d);
            return d;
          },
        }
      : {}),
  };
}

function relabel(name: string, blocks: readonly SkillBlockInfo[] | undefined): string {
  const m = /^skill:(\d+)$/.exec(name);
  const skill = m ? blocks?.[Number(m[1])] : undefined;
  return skill ? `skill:${skill.name}` : name;
}

export function buildPromptAssembledEvent(
  input: PromptAssembledInput,
  opts: { verbose: boolean },
): PromptAssembledEvent {
  const { verbose } = opts;
  const sections: PromptEventSection[] = input.sections.map((s) => ({
    name: r(relabel(s.name, input.skillBlocks)),
    source: r(s.source),
    trust: s.trust,
    chars: s.chars,
    ...(s.tokens !== undefined ? { tokens: s.tokens } : {}),
    ...(verbose && s.sha256 !== undefined ? { sha256: r(s.sha256) } : {}),
    ...(verbose && s.preview !== undefined ? { preview: r(s.preview) } : {}),
  }));

  const totals = sections.reduce(
    (t, s) => ({ sections: t.sections + 1, chars: t.chars + s.chars, tokens: t.tokens + (s.tokens ?? 0) }),
    { sections: 0, chars: 0, tokens: 0 },
  );

  const files = input.diff?.files ?? [];
  return {
    correlationId: r(input.correlationId),
    ...(input.runId ? { runId: r(input.runId) } : {}),
    prId: r(input.prId),
    ...(input.agent ? { agent: r(input.agent) } : {}),
    provider: r(input.provider),
    model: r(input.model),
    promptKind: input.promptKind,
    ...(input.promptVersion ? { promptVersion: r(input.promptVersion) } : {}),
    ...(input.mode ? { mode: input.mode } : {}),
    ...(input.chunk
      ? {
          chunk: {
            index: input.chunk.index,
            total: input.chunk.total,
            ...(verbose ? { file: r(input.chunk.file) } : {}),
          },
        }
      : {}),
    sections,
    totals,
    ...(input.diff
      ? {
          diffStats: {
            files: files.length,
            additions: files.reduce((n, f) => n + f.additions, 0),
            deletions: files.reduce((n, f) => n + f.deletions, 0),
            hunks: files.reduce((n, f) => n + f.hunks.length, 0),
          },
        }
      : {}),
    ...(verbose && input.diff ? { diffFiles: files.slice(0, MAX_DIFF_FILES).map((f) => r(f.path)) } : {}),
    ...(verbose && input.skillBlocks && input.skillBlocks.length > 0
      ? {
          skills: input.skillBlocks.map((b) => ({
            name: r(b.name),
            ...(b.version !== undefined ? { version: typeof b.version === 'string' ? r(b.version) : b.version } : {}),
            ...(b.tokens !== undefined ? { tokens: b.tokens } : {}),
          })),
        }
      : {}),
  };
}

function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

/** Short human line for the Live Log (no manifest detail beyond counts). */
export function promptSummaryLine(e: PromptAssembledEvent): string {
  const chunk = e.chunk ? ` (chunk ${e.chunk.index + 1}/${e.chunk.total})` : '';
  return `Prompt: ${e.totals.sections} sections, ~${formatTokens(e.totals.tokens)} tokens, model ${e.model}${chunk}`;
}
