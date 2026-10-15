import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { DownstreamImpact } from "@devdigest/shared";
import messages from "../../../../../../../../../../../../messages/en/blast.json";
import { BlastGraph } from "./BlastGraph";

afterEach(cleanup);

/** Visible node labels (the SVG <text>s; each node's <title> tooltip repeats the full label). */
const labels = (graph: Element) => [...graph.querySelectorAll("text")].map((t) => t.textContent);

const DOWNSTREAM: DownstreamImpact[] = [
  {
    symbol: "rateLimit",
    callers: [
      { name: "publicRouter", file: "src/api/public/index.ts", line: 23 },
      { name: "webhookHandler", file: "src/api/public/webhooks.ts", line: 45 },
    ],
    endpoints_affected: ["POST /api/public/webhooks/incoming"],
    crons_affected: ["reset-rate-buckets"],
  },
];

function setup(downstream: DownstreamImpact[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
      <BlastGraph downstream={downstream} />
    </NextIntlClientProvider>,
  );
}

describe("BlastGraph", () => {
  it("draws a labelled graph with a node per symbol, caller, endpoint and cron", () => {
    setup(DOWNSTREAM);
    const graph = screen.getByRole("img", { name: "Blast radius graph" });
    expect(labels(graph)).toEqual(
      expect.arrayContaining(["rateLimit()", "publicRouter", "webhookHandler", "reset-rate-buckets"]),
    );
    // 2 symbol→caller edges + 2 callers × (1 endpoint + 1 cron)
    expect(graph.querySelectorAll("path")).toHaveLength(6);
  });

  it("shortens long labels and keeps the full text as a tooltip", () => {
    setup(DOWNSTREAM);
    const graph = screen.getByRole("img", { name: "Blast radius graph" });
    expect(labels(graph)).not.toContain("POST /api/public/webhooks/incoming");
    expect(labels(graph)).toContain("POST /api/public/we…");
    const titles = [...graph.querySelectorAll("title")].map((t) => t.textContent);
    expect(titles).toContain("POST /api/public/webhooks/incoming");
  });

  it("shows a legend", () => {
    setup(DOWNSTREAM);
    const legend = screen.getByRole("list", { name: "Legend" });
    expect(within(legend).getByText("changed symbol")).toBeInTheDocument();
    expect(within(legend).getByText("callers")).toBeInTheDocument();
    expect(within(legend).getByText("endpoints affected")).toBeInTheDocument();
    expect(within(legend).getByText("crons affected")).toBeInTheDocument();
  });

  it("shows a message instead of an empty graph", () => {
    setup([]);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("No downstream callers to graph.")).toBeInTheDocument();
  });
});
