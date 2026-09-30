/* skill-diff.ts — minimal line diff (LCS) for the skill Versioning tab.
   `diffLines(old, current)`: lines only in `old` → "del", only in `current` → "add". */

export type DiffKind = "same" | "add" | "del";

export interface DiffLine {
  kind: DiffKind;
  text: string;
}

function toLines(text: string): string[] {
  if (text === "") return [];
  return text.replace(/\r\n/g, "\n").split("\n");
}

/** LCS suffix lengths in a flat table: at(i, j) = LCS of a[i..] and b[j..]. */
function lcsTable(a: readonly string[], b: readonly string[]): (i: number, j: number) => number {
  const width = b.length + 1;
  const table = new Uint32Array((a.length + 1) * width);
  const at = (i: number, j: number) => table[i * width + j] ?? 0;
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * width + j] = a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }
  return at;
}

/** Line diff of `oldText` → `newText`. Removals are emitted before additions at each change point. */
export function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = toLines(oldText);
  const b = toLines(newText);
  const at = lcsTable(a, b);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    const oldLine = a[i];
    const newLine = b[j];
    if (oldLine !== undefined && newLine !== undefined && oldLine === newLine) {
      out.push({ kind: "same", text: oldLine });
      i++;
      j++;
    } else if (oldLine !== undefined && (newLine === undefined || at(i + 1, j) >= at(i, j + 1))) {
      out.push({ kind: "del", text: oldLine });
      i++;
    } else if (newLine !== undefined) {
      out.push({ kind: "add", text: newLine });
      j++;
    }
  }
  return out;
}

export function diffStats(lines: readonly DiffLine[]): { added: number; removed: number } {
  return {
    added: lines.filter((l) => l.kind === "add").length,
    removed: lines.filter((l) => l.kind === "del").length,
  };
}
