import { describe, it, expect } from 'vitest';
import { defaultFeatureModel } from '../src/modules/settings/feature-models.js';

describe('feature model defaults', () => {
  it('review_intent defaults to a cheap non-reasoning model on openrouter', () => {
    expect(defaultFeatureModel('review_intent')).toEqual({
      provider: 'openrouter',
      model: 'openai/gpt-4.1-mini',
    });
  });
});
