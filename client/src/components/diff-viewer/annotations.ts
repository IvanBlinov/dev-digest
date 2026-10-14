/* Generic line annotations for the DiffViewer (e.g. review findings under a line).
   The caller supplies the rendered node, marker colour and all wording; this
   module only decides where each annotation lands. Pure — no React rendering. */
import type { ReactNode } from "react";
import { keysForLine } from "./comments";
import type { Line } from "./helpers";

/** Severity-style marker for the anchored line: a left bar plus a right-aligned label. */
export interface LineMarker {
  color: string;
  label: string;
}

/** One thing to render under a diff line (`key` = `${side}:${line}`, see `lineKey`). */
export interface LineAnnotation {
  id: string;
  path: string;
  key: string;
  marker: LineMarker | null;
  node: ReactNode;
}

/** What the viewer needs to render annotations. Wording is passed in by the caller. */
export interface DiffAnnotationApi {
  items: LineAnnotation[];
  /** When false, the nodes and the outside block are hidden; markers and flags stay. */
  visible: boolean;
  /** Paths that get a flag dot in the file header. */
  flaggedPaths: ReadonlySet<string>;
  flagLabel: string;
  outsideTitle: string;
}

/** Split annotations into ones anchored to a rendered line and ones outside the patch. */
export function partitionAnnotations(
  items: readonly LineAnnotation[],
  renderedKeys: ReadonlySet<string>,
): { matched: Map<string, LineAnnotation[]>; outside: LineAnnotation[] } {
  const matched = new Map<string, LineAnnotation[]>();
  const outside: LineAnnotation[] = [];
  for (const item of items) {
    if (renderedKeys.has(item.key)) {
      matched.set(item.key, [...(matched.get(item.key) ?? []), item]);
    } else {
      outside.push(item);
    }
  }
  return { matched, outside };
}

/** Annotations anchored to a parsed line. */
export function annotationsForLine(
  ln: Line,
  matched: ReadonlyMap<string, LineAnnotation[]>,
): LineAnnotation[] {
  if (matched.size === 0) return [];
  return keysForLine(ln).flatMap((k) => matched.get(k) ?? []);
}

/** First non-null marker among the annotations on this line. */
export function markerForLine(
  ln: Line,
  matched: ReadonlyMap<string, LineAnnotation[]>,
): LineMarker | null {
  for (const a of annotationsForLine(ln, matched)) if (a.marker) return a.marker;
  return null;
}
