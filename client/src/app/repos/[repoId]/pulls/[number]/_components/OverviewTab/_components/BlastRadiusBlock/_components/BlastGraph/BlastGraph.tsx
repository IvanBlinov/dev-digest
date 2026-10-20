/* BlastGraph — the Graph view of the blast radius: changed symbols → callers → endpoints/crons,
   drawn as inline SVG. Labels are repo-derived and rendered as SVG text only. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { DownstreamImpact } from "@devdigest/shared";
import { edgePath, graphLayout, shortLabel, type GraphNode, type GraphNodeKind } from "./helpers";
import { NODE_TONE, s } from "./styles";

const LEGEND: GraphNodeKind[] = ["symbol", "caller", "endpoint", "cron"];

function Node({ node }: { node: GraphNode }) {
  const tone = NODE_TONE[node.kind];
  return (
    <g>
      <title>{node.label}</title>
      <rect x={node.x} y={node.y} width={node.w} height={node.h} rx={7} style={{ fill: tone.fill, stroke: tone.stroke }} strokeWidth={1.5} />
      <text x={node.x + node.w / 2} y={node.y + node.h / 2} textAnchor="middle" dominantBaseline="central" style={s.nodeText}>
        {shortLabel(node.label)}
      </text>
    </g>
  );
}

export function BlastGraph({ downstream }: { downstream: DownstreamImpact[] }) {
  const t = useTranslations("blast");
  const layout = graphLayout(downstream);
  if (layout.nodes.length === 0) return <p style={s.muted}>{t("graph.empty")}</p>;

  const byId = new Map(layout.nodes.map((n) => [n.id, n]));
  return (
    <div style={s.wrap}>
      <svg role="img" aria-label={t("graph.ariaLabel")} viewBox={`0 0 ${layout.width} ${layout.height}`} style={s.svg}>
        {layout.edges.map((e) => (
          <path key={`${e.from}>${e.to}`} d={edgePath(byId.get(e.from)!, byId.get(e.to)!)} style={s.edge} />
        ))}
        {layout.nodes.map((n) => (
          <Node key={n.id} node={n} />
        ))}
      </svg>
      <ul aria-label={t("graph.legendAria")} style={s.legend}>
        {LEGEND.map((kind) => (
          <li key={kind} style={s.legendItem}>
            <span style={{ ...s.dot, background: NODE_TONE[kind].stroke }} />
            {t(`graph.legend.${kind}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}
