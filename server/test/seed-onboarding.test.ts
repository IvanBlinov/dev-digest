import { describe, it, expect } from 'vitest';
import { OnboardingTour } from '@devdigest/shared';
import { ONBOARDING_PROMPT_VERSION } from '@devdigest/reviewer-core';
import { SEED_ONBOARDING_TOUR } from '../src/db/seed-onboarding.js';

describe('seeded onboarding tour', () => {
  it('AC-70: the seed tour parses OnboardingTour, has status ready, five llm sections, cited paths ⊆ known_paths, the current prompt_version and llm_calls 1', () => {
    const parsed = OnboardingTour.safeParse(SEED_ONBOARDING_TOUR);
    expect(parsed.success, JSON.stringify((parsed as { error?: unknown }).error ?? {})).toBe(true);
    const tour = SEED_ONBOARDING_TOUR;
    expect(tour.status).toBe('ready');
    expect(tour.prompt_version).toBe(ONBOARDING_PROMPT_VERSION);
    expect(tour.generation.llm_calls).toBe(1);
    expect(tour.index_sha).toBeNull();

    const sections = Object.values(tour.sections);
    expect(sections).toHaveLength(5);
    for (const s of sections) {
      expect(s.source).toBe('llm');
      expect(s.unavailable_reason).toBeNull();
    }

    const known = new Set(tour.known_paths);
    const cited = [
      ...tour.sections.critical_paths.items.map((i) => i.path),
      ...tour.sections.reading_path.items.map((i) => i.path),
      ...tour.sections.first_tasks.items.flatMap((i) => i.paths),
    ];
    expect(cited.length).toBeGreaterThan(0);
    for (const p of cited) expect(known.has(p), p).toBe(true);
  });
});
