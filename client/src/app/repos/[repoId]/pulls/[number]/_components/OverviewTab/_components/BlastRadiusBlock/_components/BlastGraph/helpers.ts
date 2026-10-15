import type { DownstreamImpact } from "@devdigest/shared";

export type GraphNodeKind = "symbol" | "caller" | "endpoint" | "cron";

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  /** Full text; the SVG shows `shortLabel(label)` and keeps this as a tooltip. */
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
}

/** SVG user units; the SVG scales to the card width through its viewBox. */
export const GRAPH_WIDTH = 640;
const NODE_H = 30;
const ROW_H = 44;
const PAD_Y = 8;
const COLUMNS: Record<"symbol" | "caller" | "fact", { x: number; w: number }> = {
  symbol: { x: 4, w: 170 },
  caller: { x: 236, w: 170 },
  fact: { x: 466, w: 170 },
};

/** Characters that fit in a node at the 13px mono font used by the graph. */
export const LABEL_CHARS = 20;

export function shortLabel(label: string, max: number = LABEL_CHARS): string {
  return label.length <= max ? label : `${label.slice(0, max - 1)}…`;
}

interface Column {
  keys: string[];
  labels: Map<string, string>;
  kinds: Map<string, GraphNodeKind>;
}

function emptyColumn(): Column {
  return { keys: [], labels: new Map(), kinds: new Map() };
}

function addToColumn(col: Column, key: string, label: string, kind: GraphNodeKind): void {
  if (col.labels.has(key)) return;
  col.keys.push(key);
  col.labels.set(key, label);
  col.kinds.set(key, kind);
}

/**
 * Three columns, left to right: changed symbols → their callers → the endpoints and crons behind
 * those callers. Callers are one node per name + file; endpoints/crons one node per value. The
 * contract attributes endpoints to a symbol's caller group, not to single callers, so every caller
 * of a group links to every endpoint/cron of that group.
 */
export function graphLayout(downstream: DownstreamImpact[]): GraphLayout {
  const symbols = emptyColumn();
  const callers = emptyColumn();
  const facts = emptyColumn();
  const edgeKeys = new Set<string>();
  const edges: GraphEdge[] = [];
  const link = (from: string, to: string) => {
    const k = `${from}>${to}`;
    if (edgeKeys.has(k)) return;
    edgeKeys.add(k);
    edges.push({ from, to });
  };

  for (const d of downstream) {
    const symbolId = `s:${d.symbol}`;
    addToColumn(symbols, symbolId, `${d.symbol}()`, "symbol");
    const factIds = [
      ...d.endpoints_affected.map((e) => {
        const id = `e:${e}`;
        addToColumn(facts, id, e, "endpoint");
        return id;
      }),
      ...d.crons_affected.map((c) => {
        const id = `c:${c}`;
        addToColumn(facts, id, c, "cron");
        return id;
      }),
    ];
    for (const c of d.callers) {
      const callerId = `k:${c.name}@${c.file}`;
      addToColumn(callers, callerId, c.name, "caller");
      link(symbolId, callerId);
      factIds.forEach((f) => link(callerId, f));
    }
  }

  const rows = Math.max(symbols.keys.length, callers.keys.length, facts.keys.length);
  const height = rows === 0 ? 0 : rows * ROW_H - (ROW_H - NODE_H) + PAD_Y * 2;
  const place = (col: Column, at: { x: number; w: number }): GraphNode[] => {
    // Centre shorter columns against the tallest one.
    const top = PAD_Y + ((rows - col.keys.length) * ROW_H) / 2;
    return col.keys.map((id, i) => ({
      id,
      kind: col.kinds.get(id)!,
      label: col.labels.get(id)!,
      x: at.x,
      y: top + i * ROW_H,
      w: at.w,
      h: NODE_H,
    }));
  };

  return {
    nodes: [...place(symbols, COLUMNS.symbol), ...place(callers, COLUMNS.caller), ...place(facts, COLUMNS.fact)],
    edges,
    width: GRAPH_WIDTH,
    height,
  };
}

/** Smooth left-to-right curve from the right edge of `a` to the left edge of `b`. */
export function edgePath(a: GraphNode, b: GraphNode): string {
  const x1 = a.x + a.w;
  const y1 = a.y + a.h / 2;
  const x2 = b.x;
  const y2 = b.y + b.h / 2;
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}
