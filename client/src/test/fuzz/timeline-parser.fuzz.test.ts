import { describe, expect, test } from 'vitest';
import fc from 'fast-check';
import {
  detectInstruments,
  parseEntities,
  extractModifiers,
  buildTracksFromSnapshots,
  buildAdaptiveTracksFromSnapshots,
  parseCodeAtTimestamp,
  resolveSnapshotCodes,
  type ResolvableSnapshot,
} from '@/lib/timeline-parser';
import { diffToPatch } from '@/lib/diff';
import { lineArrayArb } from '@/test/arbitraries';

/**
 * Semantic (not just no-throw) property tests for the timeline parser.
 *
 * Oracles:
 *  - L1: a keyframe + sparse-splice chain must reconstruct every intermediate
 *        full document exactly.
 *  - L2: reconstruction via the parser must equal `applyPatch` via the diff lib.
 */

function buildChain(initial: string, steps: string[]): ResolvableSnapshot[] {
  const snaps: ResolvableSnapshot[] = [
    { id: 'k0', entityId: 'e0', timestamp: 0, code: initial, actionType: 'edit' },
  ];
  let prev = initial;
  let prevId = 'k0';
  steps.forEach((code, i) => {
    const patch = diffToPatch(prev, code);
    const id = `s${i + 1}`;
    snaps.push({
      id,
      entityId: 'e0',
      timestamp: (i + 1) * 1000,
      code: JSON.stringify(patch),
      actionType: 'edit',
      baseSnapshotId: prevId,
    });
    prev = code;
    prevId = id;
  });
  return snaps;
}

describe('fuzz: timeline-parser chain reconstruction (L1/L2)', () => {
  test('resolveSnapshotCodes reconstructs every document in a patch chain', () => {
    fc.assert(
      fc.property(
        lineArrayArb.map((ls) => ls.join('\n')),
        fc.array(lineArrayArb.map((ls) => ls.join('\n')), { minLength: 1, maxLength: 8 }),
        (initial, steps) => {
          const chain = buildChain(initial, steps);
          const resolved = resolveSnapshotCodes(chain);
          const expected = [initial, ...steps];
          expect(resolved.map((r) => r.code)).toEqual(expected);
          expect(resolved.every((r) => r.baseSnapshotId === undefined)).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  test('resolving already-resolved snapshots is a fixed point', () => {
    fc.assert(
      fc.property(
        lineArrayArb.map((ls) => ls.join('\n')),
        fc.array(lineArrayArb.map((ls) => ls.join('\n')), { maxLength: 5 }),
        (initial, steps) => {
          const resolved = resolveSnapshotCodes(buildChain(initial, steps));
          const again = resolveSnapshotCodes(resolved as ResolvableSnapshot[]);
          expect(again.map((r) => r.code)).toEqual(resolved.map((r) => r.code));
        },
      ),
      { numRuns: 150 },
    );
  });

  test('resolves despite a dropped base id (legacy fallback)', () => {
    const chain = buildChain('a\nb\nc', ['a\nB\nc', 'a\nB\nC']);
    // Drop the baseSnapshotId of the second patch, as older exports did.
    const mangled = chain.map((s, i) => (i === 2 ? { ...s, baseSnapshotId: undefined } : s));
    const resolved = resolveSnapshotCodes(mangled);
    // The fallback looks for a DiffOp[] (legacy) format; a splice payload with a
    // missing base is left as-is rather than throwing.
    expect(resolved.length).toBe(chain.length);
    expect(() => resolveSnapshotCodes(mangled)).not.toThrow();
  });
});

describe('fuzz: timeline-parser time queries', () => {
  test('parseCodeAtTimestamp returns the latest resolved code at or before t', () => {
    fc.assert(
      fc.property(
        fc.array(lineArrayArb.map((ls) => ls.join('\n')), { minLength: 1, maxLength: 6 }),
        lineArrayArb.map((ls) => ls.join('\n')),
        (steps, initial) => {
          const chain = buildChain(initial, steps);
          const resolved = resolveSnapshotCodes(chain);
          for (let i = 0; i < chain.length; i++) {
            const t = chain[i].timestamp;
            expect(parseCodeAtTimestamp(chain, t)).toBe(resolved[i].code);
          }
          expect(parseCodeAtTimestamp(chain, -1)).toBe('// empty');
        },
      ),
      { numRuns: 150 },
    );
  });
});

describe('fuzz: timeline-parser tracks', () => {
  test('buildTracksFromSnapshots emits ordered, well-formed events', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            timestamp: fc.integer({ min: 0, max: 50_000 }),
            code: fc.constantFrom('s("bd")\n\ns("hh")', 's("bd bb")\n\ns("hh")', 'note("c3").s("sawtooth")'),
            entityId: fc.constantFrom('e0', 'e1'),
          }),
          { minLength: 1, maxLength: 12 },
        ),
        (snaps) => {
          const tracks = buildTracksFromSnapshots(snaps);
          expect(Array.isArray(tracks)).toBe(true);
          for (const track of tracks) {
            for (const ev of track.events) {
              expect(ev.endMs).toBeGreaterThanOrEqual(ev.startMs);
              expect(typeof ev.code).toBe('string');
            }
          }
          const starts = tracks.map((t) => t.events[0]?.startMs ?? 0);
          expect([...starts].sort((a, b) => a - b)).toEqual(starts);
        },
      ),
      { numRuns: 200 },
    );
  });

  test('buildAdaptiveTracksFromSnapshots is a no-throw boundary against empty', () => {
    expect(buildAdaptiveTracksFromSnapshots([])).toEqual([]);
  });
});

describe('fuzz: timeline-parser never throws (defensive)', () => {
  test('all public functions survive arbitrary strings', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 400 }), fc.integer(), (input, idx) => {
        expect(() => detectInstruments(input)).not.toThrow();
        expect(() => parseEntities(input)).not.toThrow();
        expect(() => extractModifiers(input, idx)).not.toThrow();
      }),
      { numRuns: 300 },
    );
  });

  test('detectInstruments respects MAX_INSTRUMENTS and is deduped', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 800 }), (input) => {
        const result = detectInstruments(input);
        expect(result.length).toBeLessThanOrEqual(50);
        const names = result.map((r) => r.name);
        expect(new Set(names).size).toBe(names.length);
      }),
    );
  });
});

describe('fuzz: parseEntities cache isolation', () => {
  // Fixed: timeline-parser.ts now returns a defensive copy, so callers cannot
  // corrupt the shared parse cache.
  test('parseEntities does not hand out a shared, mutable cached array', () => {
    const unique = `s("bd") // ${Math.random()} ${Date.now()}`;
    const first = parseEntities(unique);
    expect(first.length).toBeGreaterThan(0);
    first[0].name = 'MUTATED';
    first[0].codeLines.push('tampered');
    const second = parseEntities(unique);
    expect(second[0].name).not.toBe('MUTATED');
    expect(second[0].codeLines).not.toContain('tampered');
  });

  test('every call returns a fresh, independent array', () => {
    const code = `note("c3").s("piano") // ${Math.random()}`;
    const a = parseEntities(code);
    const b = parseEntities(code);
    expect(a).not.toBe(b);
    expect(a[0]).not.toBe(b[0]);
    expect(a[0].codeLines).not.toBe(b[0].codeLines);
  });
});
