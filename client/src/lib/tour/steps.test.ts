import { describe, it, expect } from 'vitest';
import { TOUR_STEPS, TOUR_TARGETS } from './steps';

describe('tour steps', () => {
  it('has unique ids', () => {
    const ids = TOUR_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every step has a title and body', () => {
    for (const step of TOUR_STEPS) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.body.length).toBeGreaterThan(0);
    }
  });

  it('is action-gated except for the first (welcome) step', () => {
    expect(TOUR_STEPS[0].advanceWhen).toBeUndefined();
    for (const step of TOUR_STEPS.slice(1)) {
      expect(typeof step.advanceWhen).toBe('function');
    }
  });

  it('exposes a deduped target list', () => {
    expect(TOUR_TARGETS.length).toBeGreaterThan(5);
    expect(new Set(TOUR_TARGETS).size).toBe(TOUR_TARGETS.length);
  });

  it('marks peripheral steps optional', () => {
    const media = TOUR_STEPS.find((s) => s.id === 'media');
    expect(media?.optional).toBe(true);
  });
});
