import type { ConventionsView } from '../domain/conventions';
import type { ResponseFormat } from './findings';
import {
  CATEGORY_MAX,
  HINT_RESERVE,
  MAX_RESPONSE_CHARS,
  PATH_MAX,
  capItems,
  fenceUntrusted,
  oneLine,
} from './text';

const NEVER_STARTS = 'This tool never starts extraction; run it from the DevDigest UI.';
const RULE_MAX = 300;
const SNIPPET_MAX = 800;

export function presentConventions(view: ConventionsView, format: ResponseFormat): string {
  if (view.items.length === 0) {
    if (view.scan === 'running') {
      return `Convention scan for ${view.repoName} is in progress. Call again in ~30s. ${NEVER_STARTS}`;
    }
    if (!view.indexed) {
      return `No conventions for ${view.repoName}: the repo is not indexed yet. Index it in the DevDigest UI, then scan. ${NEVER_STARTS}`;
    }
    if (view.scan === 'failed') {
      return `The last convention scan for ${view.repoName} failed. Re-run it in the DevDigest UI. ${NEVER_STARTS}`;
    }
    return `No conventions extracted yet for ${view.repoName}. ${NEVER_STARTS}`;
  }

  const header = `${view.total} convention(s) for ${view.repoName} (scan: ${view.scan})`;
  const render = (c: ConventionsView['items'][number], i: number): string => {
    const lines =
      c.startLine === null ? '' : `:${c.startLine}${c.endLine === null ? '' : `-${c.endLine}`}`;
    const row = `${i + 1}. [${oneLine(c.category, CATEGORY_MAX)}] ${oneLine(c.rule, RULE_MAX)} · ${oneLine(c.evidencePath, PATH_MAX)}${lines} (${c.status})`;
    return format === 'detailed' ? `${row}\n${fenceUntrusted(c.snippet, SNIPPET_MAX)}` : row;
  };
  const { text, rendered } = capItems(view.items, render, MAX_RESPONSE_CHARS - header.length - HINT_RESERVE);
  const more = view.total - rendered;
  const hint = more > 0 ? `\n${more} more not shown (raise limit, max 100).` : '';
  return `${header}\n${text}${hint}`;
}
