import { describe, it, expect } from "vitest";
import type { ConventionCandidate, ConventionScan, ConventionsState } from "@devdigest/shared";
import { applyConventionPatch, isScanRunning } from "./conventions";

const cand = (id: string, over: Partial<ConventionCandidate> = {}): ConventionCandidate => ({
  id,
  category: "naming",
  rule: `rule ${id}`,
  evidence_path: "src/a.ts",
  evidence_start_line: 1,
  evidence_end_line: 2,
  evidence_snippet: "x",
  confidence: 0.9,
  status: "pending",
  accepted: false,
  edited: false,
  created_at: "2026-09-30T00:00:00Z",
  ...over,
});

const STATE: ConventionsState = {
  repo_id: "r1",
  repo_name: "acme/api",
  indexed: true,
  scan: null,
  candidates: [cand("a"), cand("b")],
};

describe("applyConventionPatch", () => {
  it("removes a rejected candidate without mutating the input", () => {
    const next = applyConventionPatch(STATE, "a", { status: "rejected" });
    expect(next.candidates.map((c) => c.id)).toEqual(["b"]);
    expect(STATE.candidates).toHaveLength(2);
  });

  it("accepting keeps the `accepted` mirror in sync", () => {
    const next = applyConventionPatch(STATE, "b", { status: "accepted" });
    expect(next.candidates[1]).toMatchObject({ status: "accepted", accepted: true });
    expect(next.candidates[0]).toBe(STATE.candidates[0]);
  });

  it("merges inline edits", () => {
    const next = applyConventionPatch(STATE, "a", { rule: "new rule", evidence_start_line: 5 });
    expect(next.candidates[0]).toMatchObject({ rule: "new rule", evidence_start_line: 5, status: "pending" });
  });
});

describe("isScanRunning", () => {
  it("is true only for a running scan", () => {
    expect(isScanRunning(undefined)).toBe(false);
    expect(isScanRunning(STATE)).toBe(false);
    const scan: ConventionScan = { id: "s", repo_id: "r1", status: "running", sample_files: [], provider: "openrouter", model: "m", candidates_found: null, error: null, started_at: "", finished_at: null };
    expect(isScanRunning({ ...STATE, scan })).toBe(true);
    expect(isScanRunning({ ...STATE, scan: { ...scan, status: "done" } })).toBe(false);
  });
});
