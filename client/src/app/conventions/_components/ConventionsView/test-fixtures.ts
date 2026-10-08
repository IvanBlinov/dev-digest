/* Shared fixtures for the Conventions component tests (imported by *.test.tsx only). */
import type { ConventionCandidate, ConventionScan, ConventionsState } from "@devdigest/shared";

export const REPO_ID = "11111111-1111-4111-8111-111111111111";

export function candidate(over: Partial<ConventionCandidate> = {}): ConventionCandidate {
  return {
    id: "c1",
    category: "error-handling",
    rule: "Route handlers throw typed AppError subclasses instead of returning error objects",
    evidence_path: "server/src/modules/repos/routes.ts",
    evidence_start_line: 12,
    evidence_end_line: 18,
    evidence_snippet: "throw new NotFoundError('repo');",
    confidence: 0.86,
    status: "pending",
    accepted: false,
    edited: false,
    created_at: "2026-09-30T10:00:00Z",
    ...over,
  };
}

export function scan(over: Partial<ConventionScan> = {}): ConventionScan {
  return {
    id: "scan1",
    repo_id: REPO_ID,
    status: "done",
    sample_files: ["tsconfig.json", "src/a.ts", "src/b.ts"],
    provider: "openrouter",
    model: "deepseek/deepseek-v4-flash",
    candidates_found: 3,
    error: null,
    started_at: new Date(Date.now() - 3_660_000).toISOString(),
    finished_at: new Date(Date.now() - 3_600_000).toISOString(),
    ...over,
  };
}

export function state(over: Partial<ConventionsState> = {}): ConventionsState {
  return {
    repo_id: REPO_ID,
    repo_name: "IvanBlinov/dev-digest",
    indexed: true,
    scan: scan(),
    candidates: [
      candidate({ id: "a", status: "accepted", accepted: true }),
      candidate({ id: "b", rule: "Files use kebab-case names", category: "naming", confidence: 0.64 }),
    ],
    ...over,
  };
}
