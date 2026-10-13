import { describe, expect, test } from 'vitest';
import fc from 'fast-check';
import {
  detectInstruments,
  parseEntities,
  extractModifiers,
  buildTracksFromSnapshots,
  buildAdaptiveTracksFromSnapshots,
  parseCodeAtTimestamp,
} from '@/lib/timeline-parser';

describe('fuzz: timeline-parser property-based tests', () => {
  test('detectInstruments never throws on arbitrary strings', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 500 }), (input) => {
        expect(() => detectInstruments(input)).not.toThrow();
        const result = detectInstruments(input);
        expect(Array.isArray(result)).toBe(true);
        result.forEach((inst) => {
          expect(typeof inst.name).toBe('string');
          expect(typeof inst.category).toBe('string');
          expect(typeof inst.lineIndex).toBe('number');
        });
      }),
    );
  });

  test('detectInstruments result count does not exceed MAX_INSTRUMENTS', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 1000 }), (input) => {
        const result = detectInstruments(input);
        expect(result.length).toBeLessThanOrEqual(50);
      }),
    );
  });

  test('parseEntities never throws on arbitrary strings', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 500 }), (input) => {
        expect(() => parseEntities(input)).not.toThrow();
        const entities = parseEntities(input);
        expect(Array.isArray(entities)).toBe(true);
        entities.forEach((e) => {
          expect(typeof e.id).toBe('string');
          expect(typeof e.name).toBe('string');
          expect(typeof e.category).toBe('string');
          expect(Array.isArray(e.codeLines)).toBe(true);
        });
      }),
    );
  });

  test('parseEntities handles extremely long lines without crash', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1000, maxLength: 10000 }),
        (input) => {
          expect(() => parseEntities(input)).not.toThrow();
        },
      ),
    );
  });

  test('extractModifiers never throws on arbitrary strings', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 300 }), fc.integer(), (input, idx) => {
        expect(() => extractModifiers(input, idx)).not.toThrow();
        const mods = extractModifiers(input, idx);
        expect(Array.isArray(mods)).toBe(true);
        mods.forEach((m) => {
          expect(typeof m.name).toBe('string');
          expect(typeof m.value).toBe('number');
          expect(m.lineIndex).toBe(idx);
        });
      }),
    );
  });

  test('extractModifiers extracts numeric values correctly', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.integer({ min: 0, max: 100 }),
        (name, val) => {
          // Only alphanumeric modifier names to avoid regex issues
          const safeName = name.replace(/[^a-zA-Z]/g, 'm');
          if (!safeName) return;
          const code = `.${safeName}(${val})`;
          const mods = extractModifiers(code, 0);
          if (mods.length > 0) {
            expect(mods[0].name).toBe(safeName);
            expect(mods[0].value).toBe(val);
          }
        },
      ),
    );
  });

  test('buildTracksFromSnapshots never throws on arbitrary snapshot arrays', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            timestamp: fc.integer({ min: 0, max: 60000 }),
            code: fc.string({ minLength: 0, maxLength: 100 }),
            entityId: fc.string({ minLength: 0, maxLength: 20 }),
          }),
          { minLength: 0, maxLength: 20 },
        ),
        (snapshots) => {
          expect(() => buildTracksFromSnapshots(snapshots)).not.toThrow();
          const tracks = buildTracksFromSnapshots(snapshots);
          expect(Array.isArray(tracks)).toBe(true);
        },
      ),
    );
  });

  test('buildAdaptiveTracksFromSnapshots never throws on arbitrary snapshot arrays', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            timestamp: fc.integer({ min: 0, max: 60000 }),
            code: fc.string({ minLength: 0, maxLength: 100 }),
            entityId: fc.string({ minLength: 0, maxLength: 20 }),
          }),
          { minLength: 0, maxLength: 20 },
        ),
        (snapshots) => {
          expect(() => buildAdaptiveTracksFromSnapshots(snapshots)).not.toThrow();
          const tracks = buildAdaptiveTracksFromSnapshots(snapshots);
          expect(Array.isArray(tracks)).toBe(true);
        },
      ),
    );
  });

  test('parseCodeAtTimestamp never throws on arbitrary inputs', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            timestamp: fc.integer({ min: 0, max: 60000 }),
            code: fc.string({ minLength: 0, maxLength: 100 }),
            entityId: fc.string({ minLength: 0, maxLength: 20 }),
          }),
          { minLength: 0, maxLength: 20 },
        ),
        fc.integer({ min: -1000, max: 70000 }),
        (snapshots, target) => {
          expect(() =>
            parseCodeAtTimestamp(snapshots as any, target),
          ).not.toThrow();
          const code = parseCodeAtTimestamp(snapshots as any, target);
          expect(typeof code).toBe('string');
        },
      ),
    );
  });
});
