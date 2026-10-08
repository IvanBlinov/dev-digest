import { describe, it, expect } from "vitest";
import type { RunEvent } from "@devdigest/shared";
import { groupRunLog } from "./helpers";

let seq = 0;
const ev = (runId: string, msg: string, extra: Partial<RunEvent> = {}): RunEvent => ({
  runId,
  seq: ++seq,
  kind: "info",
  msg,
  t: "18:06:04",
  ...extra,
});

describe("groupRunLog — one section per agent", () => {
  const runs = [
    { runId: "r1", agentName: "General Reviewer" },
    { runId: "r2", agentName: "Security Reviewer" },
  ];

  it("puts fanned-out lines in the shared section and the rest under their agent, in run order", () => {
    const g = groupRunLog(
      [
        ev("r1", "Loading PR diff…", { kind: "tool", shared: "s1" }),
        ev("r1", "Starting review with agent \"General Reviewer\""),
        ev("r2", "Starting review with agent \"Security Reviewer\""),
        ev("r2", "map: reviewing a.ts", { kind: "tool" }),
      ],
      runs,
      new Set(["r1", "r2"]),
    );
    expect(g.shared.map((l) => l.m)).toEqual(["Loading PR diff…"]);
    expect(g.agents.map((a) => a.agentName)).toEqual(["General Reviewer", "Security Reviewer"]);
    expect(g.agents[1]!.lines.map((l) => l.m)).toEqual(["Starting review with agent \"Security Reviewer\"", "map: reviewing a.ts"]);
    expect(g.agents[1]!.last?.m).toBe("map: reviewing a.ts");
  });

  it("derives each agent's status from its own stream", () => {
    const g = groupRunLog(
      [ev("r1", "Review complete", { kind: "result" }), ev("r2", "Provider failed", { kind: "error" })],
      runs,
      new Set<string>(),
    );
    expect(g.agents.map((a) => a.status)).toEqual(["done", "failed"]);
    const live = groupRunLog([ev("r1", "x")], runs, new Set(["r1"]));
    expect(live.agents[0]!.status).toBe("running");
  });

  it("falls back to a short run id when the agent name is unknown", () => {
    const g = groupRunLog([ev("abcdef123456", "x")], [{ runId: "abcdef123456", agentName: null }], new Set());
    expect(g.agents[0]!.agentName).toBe("abcdef12");
  });

  it("an open run with no lines of its own yet is queued (waiting for a concurrency slot)", () => {
    const g = groupRunLog([ev("r1", "Loading PR diff…", { shared: "s9" })], runs, new Set(["r1", "r2"]));
    expect(g.agents.map((a) => a.status)).toEqual(["queued", "queued"]);
  });
});
