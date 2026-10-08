import { describe, it, expect } from "vitest";
import type { RunEvent } from "@devdigest/shared";
import { appendRunEvent } from "./reviews";

const ev = (runId: string, msg: string, shared?: string): RunEvent => ({
  runId,
  seq: 1,
  kind: "info",
  msg,
  t: "17:45:52",
  ...(shared ? { shared } : {}),
});

describe("appendRunEvent — merging several runs' live streams", () => {
  it("keeps one copy of an event fanned out to every run", () => {
    let log: RunEvent[] = [];
    for (const id of ["a", "b", "c", "d", "e"]) log = appendRunEvent(log, ev(id, "Diff ready — starting 5 agent run(s)", "s1"));
    expect(log).toHaveLength(1);
  });

  it("keeps per-run events even when the text is identical", () => {
    let log: RunEvent[] = [];
    log = appendRunEvent(log, ev("a", "Resolving openrouter provider…"));
    log = appendRunEvent(log, ev("b", "Resolving openrouter provider…"));
    expect(log).toHaveLength(2);
  });

  it("does not mutate the previous list", () => {
    const prev: RunEvent[] = [];
    const next = appendRunEvent(prev, ev("a", "x"));
    expect(prev).toHaveLength(0);
    expect(next).toHaveLength(1);
  });
});
