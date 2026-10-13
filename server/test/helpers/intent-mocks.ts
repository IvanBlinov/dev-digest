import { MockLLMProvider } from '../../src/adapters/mocks.js';

/**
 * Review runs auto-classify the PR intent (openrouter / review_intent) when none
 * is stored. Harnesses that drive `POST /pulls/:id/review` MUST inject this so the
 * run never reaches real OpenRouter or GitHub (tests read the real secrets file —
 * see server/INSIGHTS.md).
 */
export const INTENT_FIXTURE = {
  summary: 'Add rate limiting to the public API',
  in_scope: ['rate limiter'],
  out_of_scope: ['billing'],
  confidence: 'high',
  missing_context: [],
};

export function intentMockLlm(fixture: unknown = INTENT_FIXTURE): MockLLMProvider {
  return new MockLLMProvider('openai', { structuredBySchema: { IntentClassification: fixture } });
}
