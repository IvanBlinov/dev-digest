/** Hard cap on one tool response (chars). */
export const MAX_RESPONSE_CHARS = 20_000;
/** Chars kept free for the trailing "more -> offset" hint. */
export const HINT_RESERVE = 200;

export function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1))}…`;
}

/** Collapse to one line, for list rows. */
export function oneLine(s: string, max: number): string {
  return truncate(s.replace(/\s+/g, ' ').trim(), max);
}

/** Wrap model-produced text as inert data. Backtick runs inside cannot close the fence. */
export function fenceUntrusted(s: string, max: number): string {
  const safe = truncate(s, max).replace(/```+/g, "'''");
  return `\`\`\`untrusted-model-output\n${safe}\n\`\`\``;
}

/** Render items until the budget is used; returns the text and how many whole items fit. */
export function capItems<T>(
  items: T[],
  render: (item: T, index: number) => string,
  budget: number,
): { text: string; rendered: number } {
  const parts: string[] = [];
  let used = 0;
  for (const [i, item] of items.entries()) {
    const chunk = render(item, i);
    const cost = chunk.length + 1;
    if (used + cost > budget) break;
    parts.push(chunk);
    used += cost;
  }
  return { text: parts.join('\n'), rendered: parts.length };
}
