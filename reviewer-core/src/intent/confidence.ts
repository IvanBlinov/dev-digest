import type { IntentConfidence, IntentSourceStatus } from '@devdigest/shared';

/** Minimum description length (chars) that counts as "the author explained the PR". */
export const MIN_BODY_CHARS = 80;

const ORDER: Record<IntentConfidence, number> = { low: 0, medium: 1, high: 2 };
const EXPLICIT_KINDS = new Set(['issue', 'spec', 'plan', 'link']);

export interface ConfidenceSource {
  kind: string;
  status: IntentSourceStatus;
}

/**
 * Deterministic evidence-based confidence. The model's own self-rating is combined
 * with this via `minConfidence`, so the model can lower but never raise it.
 *
 * - no real description and no fetched issue/doc → low
 * - description ≥ 80 chars OR a fetched issue/doc → medium
 * - both → high
 * - any explicitly referenced source that could not be read → at most medium
 */
export function computeIntentConfidence(input: {
  body: string;
  sources: ConfidenceSource[];
}): IntentConfidence {
  const hasBody = input.body.trim().length >= MIN_BODY_CHARS;
  const hasOkRef = input.sources.some(
    (s) => (s.kind === 'issue' || s.kind === 'spec' || s.kind === 'plan') && s.status === 'ok',
  );
  const refMissing = input.sources.some((s) => EXPLICIT_KINDS.has(s.kind) && s.status !== 'ok');
  let level: IntentConfidence = hasBody && hasOkRef ? 'high' : hasBody || hasOkRef ? 'medium' : 'low';
  if (refMissing && level === 'high') level = 'medium';
  return level;
}

export function minConfidence(a: IntentConfidence, b: IntentConfidence): IntentConfidence {
  return ORDER[a] <= ORDER[b] ? a : b;
}
