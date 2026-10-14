import type { ResolvedPr } from '../services/pr-resolver';

export function prLabel(pr: ResolvedPr): string {
  return `${pr.repo.fullName}#${pr.pr.number}`;
}
