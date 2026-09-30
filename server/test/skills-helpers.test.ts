import { describe, it, expect } from 'vitest';
import { Skill, SkillVersion } from '@devdigest/shared';
import {
  slugifySkillName,
  isContentChange,
  toSkillDto,
  toSkillVersionDto,
  validateLinkItems,
  isUniqueViolation,
} from '../src/modules/skills/helpers.js';
import type { SkillRow } from '../src/modules/skills/repository.js';

const row: SkillRow = {
  id: '00000000-0000-0000-0000-000000000001',
  workspaceId: 'ws',
  name: 'test-quality-rubric',
  description: 'd',
  type: 'rubric',
  source: 'manual',
  body: 'b',
  enabled: true,
  version: 3,
  evidenceFiles: null,
  createdAt: new Date('2026-09-29T00:00:00Z'),
};

describe('slugifySkillName', () => {
  it.each([
    ['Test Quality Rubric', 'test-quality-rubric'],
    ['  API__contract  guard!! ', 'api-contract-guard'],
    ['Ünïcödé Skill', 'unicode-skill'],
    ['already-ok', 'already-ok'],
    ['-lead-and-trail-', 'lead-and-trail'],
  ])('%s → %s', (input, out) => expect(slugifySkillName(input)).toBe(out));

  it('returns null when nothing usable is left or it is too short', () => {
    expect(slugifySkillName('!!!')).toBeNull();
    expect(slugifySkillName('a')).toBeNull();
  });

  it('caps at 64 chars without a trailing dash', () => {
    const s = slugifySkillName(`${'abc-'.repeat(30)}`)!;
    expect(s.length).toBeLessThanOrEqual(64);
    expect(s.endsWith('-')).toBe(false);
  });
});

describe('isContentChange', () => {
  it('is false for an enabled-only patch or identical values', () => {
    expect(isContentChange(row, { enabled: false })).toBe(false);
    expect(isContentChange(row, { name: row.name, body: row.body })).toBe(false);
  });
  it('is true when name/description/type/body differ', () => {
    expect(isContentChange(row, { name: 'other' })).toBe(true);
    expect(isContentChange(row, { description: 'x' })).toBe(true);
    expect(isContentChange(row, { type: 'security' })).toBe(true);
    expect(isContentChange(row, { body: 'x' })).toBe(true);
  });
});

describe('DTO mapping', () => {
  it('maps a row to a valid Skill with agent_count', () => {
    const dto = toSkillDto(row, 2);
    expect(Skill.parse(dto)).toMatchObject({ name: 'test-quality-rubric', agent_count: 2, version: 3 });
    expect(dto.created_at).toBe('2026-09-29T00:00:00.000Z');
  });
  it('maps a version row', () => {
    const v = toSkillVersionDto({
      skillId: row.id,
      version: 1,
      body: 'b',
      message: null,
      createdAt: new Date('2026-09-29T00:00:00Z'),
    });
    expect(SkillVersion.parse(v)).toEqual({ version: 1, body: 'b', message: null, created_at: '2026-09-29T00:00:00.000Z' });
  });
});

describe('validateLinkItems', () => {
  it('returns duplicate / unknown ids', () => {
    const known = new Set(['a', 'b']);
    expect(validateLinkItems([{ skill_id: 'a', enabled: true }], known)).toBeNull();
    expect(validateLinkItems([{ skill_id: 'a', enabled: true }, { skill_id: 'a', enabled: false }], known)).toMatch(/duplicate/i);
    expect(validateLinkItems([{ skill_id: 'z', enabled: true }], known)).toMatch(/not found/i);
  });
});

describe('isUniqueViolation', () => {
  it('detects a Postgres unique_violation (23505), also when wrapped in `cause`', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation(Object.assign(new Error('wrapped'), { cause: { code: '23505' } }))).toBe(true);
  });
  it('ignores other errors', () => {
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
    expect(isUniqueViolation(new Error('boom'))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});
