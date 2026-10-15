import { describe, expect, it } from 'vitest';
import { AgentsService } from '../../src/services/agents-service';
import { MockDevDigestApi, agent } from '../mocks';

describe('AgentsService', () => {
  it('lists whitelisted summaries', async () => {
    const api = new MockDevDigestApi({ agents: [agent(), agent({ id: 'a2', name: 'Style', enabled: false })] });
    const list = await new AgentsService(api).list();
    expect(list.map((a) => [a.name, a.enabled])).toEqual([
      ['Security', true],
      ['Style', false],
    ]);
    expect(JSON.stringify(list)).not.toContain('SECRET SYSTEM PROMPT');
  });
});
