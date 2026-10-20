import { describe, expect, it } from "vitest";
import type { DownstreamImpact } from "@devdigest/shared";
import { graphLayout, shortLabel } from "./helpers";

const DOWNSTREAM: DownstreamImpact[] = [
  {
    symbol: "rateLimit",
    callers: [
      { name: "publicRouter", file: "src/api/public/index.ts", line: 23 },
      { name: "webhookHandler", file: "src/api/public/webhooks.ts", line: 45 },
    ],
    endpoints_affected: ["GET /api/public/items", "POST /api/public/webhooks"],
    crons_affected: ["reset-rate-buckets"],
  },
  {
    symbol: "bucketKey",
    callers: [{ name: "publicRouter", file: "src/api/public/index.ts", line: 30 }],
    endpoints_affected: ["GET /api/public/items"],
    crons_affected: [],
  },
];

describe("graphLayout", () => {
  it("puts symbols, callers and endpoints/crons into three columns, left to right", () => {
    const { nodes } = graphLayout(DOWNSTREAM);
    const xOf = (kind: string) => [...new Set(nodes.filter((n) => n.kind === kind).map((n) => n.x))];
    expect(nodes.filter((n) => n.kind === "symbol").map((n) => n.label)).toEqual(["rateLimit()", "bucketKey()"]);
    expect(xOf("symbol")).toHaveLength(1);
    expect(xOf("caller")).toHaveLength(1);
    expect(xOf("symbol")[0]!).toBeLessThan(xOf("caller")[0]!);
    expect(xOf("caller")[0]!).toBeLessThan(xOf("endpoint")[0]!);
    expect(xOf("cron")).toEqual(xOf("endpoint"));
  });

  it("merges the same caller (name + file) and the same endpoint into one node each", () => {
    const { nodes } = graphLayout(DOWNSTREAM);
    expect(nodes.filter((n) => n.kind === "caller").map((n) => n.label)).toEqual(["publicRouter", "webhookHandler"]);
    expect(nodes.filter((n) => n.kind === "endpoint").map((n) => n.label)).toEqual([
      "GET /api/public/items",
      "POST /api/public/webhooks",
    ]);
    expect(nodes.filter((n) => n.kind === "cron").map((n) => n.label)).toEqual(["reset-rate-buckets"]);
  });

  it("keeps two callers with the same name in different files apart", () => {
    const { nodes } = graphLayout([
      {
        symbol: "a",
        callers: [
          { name: "handler", file: "x.ts", line: 1 },
          { name: "handler", file: "y.ts", line: 1 },
        ],
        endpoints_affected: [],
        crons_affected: [],
      },
    ]);
    expect(nodes.filter((n) => n.kind === "caller")).toHaveLength(2);
  });

  it("links symbol → caller and caller → its group's endpoints and crons, without duplicates", () => {
    const { nodes, edges } = graphLayout(DOWNSTREAM);
    const id = (kind: string, label: string) => nodes.find((n) => n.kind === kind && n.label === label)!.id;
    const has = (from: string, to: string) => edges.some((e) => e.from === from && e.to === to);
    expect(has(id("symbol", "rateLimit()"), id("caller", "publicRouter"))).toBe(true);
    expect(has(id("symbol", "bucketKey()"), id("caller", "publicRouter"))).toBe(true);
    expect(has(id("caller", "webhookHandler"), id("endpoint", "POST /api/public/webhooks"))).toBe(true);
    expect(has(id("caller", "publicRouter"), id("cron", "reset-rate-buckets"))).toBe(true);
    const keys = edges.map((e) => `${e.from}>${e.to}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("grows the height with the tallest column and never overlaps rows", () => {
    const { nodes, height } = graphLayout(DOWNSTREAM);
    for (const kind of ["symbol", "caller"] as const) {
      const ys = nodes.filter((n) => n.kind === kind).map((n) => n.y);
      expect(new Set(ys).size).toBe(ys.length);
    }
    expect(Math.max(...nodes.map((n) => n.y + n.h))).toBeLessThanOrEqual(height);
  });

  it("returns an empty layout for no downstream", () => {
    expect(graphLayout([])).toMatchObject({ nodes: [], edges: [] });
  });
});

describe("shortLabel", () => {
  it("keeps short labels and ellipsises long ones", () => {
    expect(shortLabel("app", 10)).toBe("app");
    expect(shortLabel("GET /api/public/items", 12)).toBe("GET /api/pu…");
  });
});
