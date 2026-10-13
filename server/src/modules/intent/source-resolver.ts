import type { GitHubClient, IntentSource, IntentSourceStatus } from '@devdigest/shared';
import type { IntentPromptSource } from '@devdigest/reviewer-core';
import { TimeoutError, withTimeout } from '../../platform/resilience.js';
import { MAX_DOC_CHARS, MAX_ISSUE_CHARS, SOURCE_TIMEOUT_MS } from './constants.js';
import type { ExtractedRefs } from './helpers.js';

/**
 * Fetches the issues and plan/spec documents the PR description references.
 * Only the authenticated GitHub API for the PR's OWN repo is called (via the
 * GitHubClient port); nothing here ever fetches an arbitrary URL.
 * Never throws: every failure becomes a source status.
 */

export interface ResolvedSources {
  /** Stored/logged form: kind, sanitised ref, status. */
  sources: IntentSource[];
  /** Prompt form: same plus the fetched text for ok sources. */
  promptSources: IntentPromptSource[];
}

function statusOf(err: unknown): IntentSourceStatus {
  if (err instanceof TimeoutError) return 'timeout';
  const status = (err as { status?: number } | null)?.status;
  if (status === 404) return 'not_found';
  if (status === 401 || status === 403) return 'forbidden';
  if (status === 413) return 'too_large';
  if (status === 415) return 'unsupported';
  return 'unavailable';
}

interface Fetched {
  source: IntentSource;
  text?: string;
}

const failed = (kind: IntentSource['kind'], ref: string, status: IntentSourceStatus): Fetched => ({
  source: { kind, ref, status },
});

export async function resolveSources(input: {
  github: () => Promise<GitHubClient>;
  repo: { owner: string; name: string };
  headSha: string;
  refs: ExtractedRefs;
}): Promise<ResolvedSources> {
  const { repo, headSha, refs } = input;

  let gh: GitHubClient | null = null;
  try {
    gh = await input.github();
  } catch {
    gh = null; // no token / config problem → degrade, never fail the classification
  }

  const jobs: Promise<Fetched>[] = [
    ...refs.issues.map(async (n): Promise<Fetched> => {
      const ref = `#${n}`;
      if (!gh) return failed('issue', ref, 'unavailable');
      try {
        const issue = await withTimeout(gh.getIssue(repo, n), SOURCE_TIMEOUT_MS);
        const full = `${issue.title}\n\n${issue.body ?? ''}`.trim();
        return {
          source: { kind: 'issue', ref, status: 'ok', truncated: full.length > MAX_ISSUE_CHARS },
          text: full.slice(0, MAX_ISSUE_CHARS),
        };
      } catch (err) {
        return failed('issue', ref, statusOf(err));
      }
    }),
    ...refs.docs.map(async (d): Promise<Fetched> => {
      if (!gh) return failed(d.kind, d.path, 'unavailable');
      try {
        const file = await withTimeout(gh.getFileContent(repo, d.path, headSha), SOURCE_TIMEOUT_MS);
        return {
          source: { kind: d.kind, ref: d.path, status: 'ok', truncated: file.content.length > MAX_DOC_CHARS },
          text: file.content.slice(0, MAX_DOC_CHARS),
        };
      } catch (err) {
        return failed(d.kind, d.path, statusOf(err));
      }
    }),
  ];

  const settled = await Promise.allSettled(jobs);
  const fetched: Fetched[] = settled.map((s, i) =>
    s.status === 'fulfilled' ? s.value : failed(i < refs.issues.length ? 'issue' : 'spec', '(unknown)', 'unavailable'),
  );
  const all: Fetched[] = [...fetched, ...refs.unresolved.map((source) => ({ source }))];

  return {
    sources: all.map((f) => f.source),
    promptSources: all.map((f) => ({
      kind: f.source.kind,
      ref: f.source.ref,
      status: f.source.status,
      ...(f.text !== undefined ? { text: f.text } : {}),
    })),
  };
}

/** One `missing_context` line per source that could not be read. */
export function missingContextLines(sources: IntentSource[]): string[] {
  return sources
    .filter((s) => s.status !== 'ok')
    .map((s) => `Could not read ${s.kind} ${s.ref} (${s.status})`);
}
