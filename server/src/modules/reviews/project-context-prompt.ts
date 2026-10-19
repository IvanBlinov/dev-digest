/**
 * L05 — turn the documents attached to an agent and its effective skills into prompt
 * blocks + trace records.
 *
 * Only `readProjectDocs` touches I/O, and only through the injected `DocsReader` port.
 * Everything else is pure. The texts go to reviewer-core as `specs: string[]`; it wraps
 * each in an `<untrusted>` block and joins them, so the token budget is counted over the
 * same joined text (SPECS_JOINER).
 */
import type { ProjectContextBlock, ProjectContextSkip, ProjectContextSkipReason } from '@devdigest/shared';
import type { DocRead, DocsReader } from '../../adapters/docs/index.js';
import type { Tokenizer } from '../../adapters/tokenizer/index.js';
import { CONTEXT_DOC_MAX_CHARS, PROJECT_CONTEXT_MAX_TOKENS } from '../project-context/constants.js';
import { contextPathError, docKind, type RootMatcher } from '../project-context/helpers.js';
import { hardenSkillBody } from './skills-prompt.js';

/** Must match how reviewer-core joins `parts.specs` (reviewer-core/src/prompt.ts). */
export const SPECS_JOINER = '\n\n';
const TRUNCATION_MARKER = '[truncated]';
/** reviewer-core's untrusted-data delimiters, neutralised in the header too. */
const UNTRUSTED_DELIMITER_RE = /<(\/?\s*untrusted)/gi;

/** Port the executor reads attachments through (implemented by ContextAttachmentsRepository). */
export interface ProjectContextSource {
  pathsForAgent(agentId: string): Promise<string[]>;
  pathsForSkills(skillIds: string[]): Promise<Map<string, string[]>>;
}

export interface ContextEntry {
  path: string;
  /** `agent` or `skill:<name>`. */
  origin: string;
}

export type ContextRead =
  | (ContextEntry & { read: DocRead })
  | (ContextEntry & { read: { ok: false; reason: 'not_cloned' } });

export interface ProjectContextPlan {
  /** Block texts in prompt order — passed verbatim as `specs` to reviewPullRequest. */
  texts: string[];
  blocks: ProjectContextBlock[];
  skipped: ProjectContextSkip[];
  /** Tokens of the whole joined section; null when nothing is injected. */
  totalTokens: number | null;
  /** Paths actually injected, in prompt order. */
  readPaths: string[];
}

/** AC-16: agent paths first, then each skill's in skill order; the first occurrence of a path wins. */
export function orderContextPaths(
  agentPaths: readonly string[],
  skills: ReadonlyArray<{ name: string; paths: readonly string[] }>,
): ContextEntry[] {
  const seen = new Set<string>();
  const out: ContextEntry[] = [];
  const add = (path: string, origin: string) => {
    if (seen.has(path)) return;
    seen.add(path);
    out.push({ path, origin });
  };
  for (const p of agentPaths) add(p, 'agent');
  for (const s of skills) for (const p of s.paths) add(p, `skill:${s.name}`);
  return out;
}

/** Reads every entry; a failure is a value, never a throw (AC-25). No size cap at run time (EC-22). */
export async function readProjectDocs(
  reader: DocsReader,
  clonePath: string | null,
  entries: readonly ContextEntry[],
  matcher: RootMatcher,
): Promise<ContextRead[]> {
  return Promise.all(
    entries.map(async (e): Promise<ContextRead> => {
      if (contextPathError(e.path, matcher) !== null) {
        return { ...e, read: { ok: false, reason: 'invalid_path' } };
      }
      if (!clonePath) return { ...e, read: { ok: false, reason: 'not_cloned' } };
      return { ...e, read: await reader.read(clonePath, e.path) };
    }),
  );
}

function formatDocument(path: string, content: string): { text: string; truncated: boolean } {
  const truncated = content.length > CONTEXT_DOC_MAX_CHARS;
  const raw = truncated ? `${content.slice(0, CONTEXT_DOC_MAX_CHARS)}\n${TRUNCATION_MARKER}` : content;
  const header = `### Document: ${path.replace(UNTRUSTED_DELIMITER_RE, '&lt;$1')}`;
  return { text: `${header}\n${hardenSkillBody(raw)}`, truncated };
}

function skipReason(read: Exclude<DocRead, { ok: true }> | { ok: false; reason: 'not_cloned' }): ProjectContextSkipReason {
  return read.reason === 'too_large' ? 'unreadable' : read.reason;
}

/** AC-18/23/24: formats, truncates and budgets the documents in order. Pure. */
export function buildProjectContextPlan(reads: readonly ContextRead[], tokenizer: Tokenizer): ProjectContextPlan {
  const texts: string[] = [];
  const blocks: ProjectContextBlock[] = [];
  const skipped: ProjectContextSkip[] = [];
  let overBudget = false;
  for (const r of reads) {
    if (!r.read.ok) {
      skipped.push({ path: r.path, reason: skipReason(r.read) });
      continue;
    }
    const { text, truncated } = formatDocument(r.path, r.read.content);
    if (overBudget || tokenizer.count([...texts, text].join(SPECS_JOINER)) > PROJECT_CONTEXT_MAX_TOKENS) {
      overBudget = true;
      skipped.push({ path: r.path, reason: 'over_budget' });
      continue;
    }
    texts.push(text);
    blocks.push({
      path: r.path,
      kind: docKind(r.path),
      origin: r.origin,
      tokens: tokenizer.count(text),
      text,
      truncated,
    });
  }
  return {
    texts,
    blocks,
    skipped,
    totalTokens: texts.length > 0 ? tokenizer.count(texts.join(SPECS_JOINER)) : null,
    readPaths: blocks.map((b) => b.path),
  };
}

/** AC-26: one run-log line; carries paths and reasons only, never document text (AC-30). */
export function projectContextLogLine(plan: ProjectContextPlan, attachedCount: number): string {
  if (attachedCount === 0) return 'project context: none attached';
  const head = `project context: ${plan.blocks.length} doc(s) injected (${plan.totalTokens ?? 0} tokens)`;
  if (plan.skipped.length === 0) return head;
  const list = plan.skipped.map((s) => `${s.path} — ${s.reason}`).join(', ');
  return `${head}, ${plan.skipped.length} skipped (${list})`;
}
