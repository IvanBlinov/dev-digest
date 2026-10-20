import type { ReviewRecord, Verdict } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";

export type BriefLink =
  | { kind: "diff"; href: string }
  | { kind: "github"; href: string }
  | { kind: "text" };

export interface BriefLinkCtx {
  changedFiles: ReadonlySet<string>;
  repoFullName: string | null;
  headSha: string | null;
}

/**
 * Where a file:line reference from the brief should lead. Files in this PR open Files changed
 * (a relative `?tab=diff` href); blast-only files open GitHub at the head SHA; with no repo name
 * (or SHA) the reference stays plain text. The path is always percent-encoded.
 */
export function briefLinkFor(file: string, line: number | null, ctx: BriefLinkCtx): BriefLink {
  if (ctx.changedFiles.has(file)) {
    return { kind: "diff", href: `?tab=diff&file=${encodeURIComponent(file)}${line ? `&line=${line}` : ""}` };
  }
  if (ctx.repoFullName && ctx.headSha) {
    return { kind: "github", href: githubBlobUrl(ctx.repoFullName, ctx.headSha, file, line ?? undefined) };
  }
  return { kind: "text" };
}

/** Shorten a long path in the middle (keeps the directory root and the file name). */
export function truncateMiddle(text: string, max: number): string {
  if (text.length <= max) return text;
  if (max <= 1) return "…".slice(0, max);
  const keep = max - 1;
  const tail = Math.ceil(keep / 2);
  const head = keep - tail;
  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`;
}

export interface LatestReview {
  verdict: Verdict;
  summary: string | null;
  score: number | null;
  findingsCount: number;
  blockers: number;
  agentName: string | null;
}

/** The newest review that has a verdict (reviews arrive newest-first); blockers = undismissed CRITICAL findings. */
export function latestReviewFor(reviews: readonly ReviewRecord[]): LatestReview | null {
  const r = reviews.find((x) => x.verdict != null);
  if (!r || r.verdict == null) return null;
  return {
    verdict: r.verdict,
    summary: r.summary,
    score: r.score,
    findingsCount: r.findings.length,
    blockers: r.findings.filter((f) => f.severity === "CRITICAL" && !f.dismissed_at).length,
    agentName: r.agent_name ?? null,
  };
}
