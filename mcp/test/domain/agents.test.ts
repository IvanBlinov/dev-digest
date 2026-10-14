import { describe, expect, it } from 'vitest';
import { toAgentSummary } from '../../src/domain/agents';
import { agent } from '../mocks';

describe('toAgentSummary', () => {
  it('whitelists fields and never carries system_prompt', () => {
    const s = toAgentSummary(agent());
    expect(Object.keys(s).sort()).toEqual(['description', 'enabled', 'id', 'model', 'name', 'provider']);
    expect(JSON.stringify(s)).not.toContain('SECRET SYSTEM PROMPT');
  });
});
