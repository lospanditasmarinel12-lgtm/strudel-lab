import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  lineDiff,
  applyDiff,
  diffToPatch,
  applyPatch,
  isSplicePatch,
  type SpliceOp,
  type DiffOp,
} from './diff';
import { applySpliceReference } from '@/test/oracles/diff';

/**
 * Property + differential tests for the snapshot diff/patch codec.
 *
 * Oracles:
 *  - L1: `apply(k, diff(a,b)) === b` for both the legacy and splice formats.
 *  - L2: an independent forward-walking reference must agree with `applyPatch`.
 */

const textArb = fc.string({ maxLength: 200 });

describe('diff: patch round-trip (L1)', () => {
  it('applyPatch(base, diffToPatch(base, target)) === target', () => {
    fc.assert(
      fc.property(textArb, textArb, (base, target) => {
        const patch = diffToPatch(base, target);
        expect(applyPatch(base, patch)).toBe(target);
      }),
      { numRuns: 500 },
    );
  });

  it('applyDiff(base, lineDiff(base, target)) === target', () => {
    fc.assert(
      fc.property(textArb, textArb, (base, target) => {
        expect(applyDiff(base, lineDiff(base, target))).toBe(target);
      }),
      { numRuns: 500 },
    );
  });

  it('splice format and legacy format agree with each other', () => {
    fc.assert(
      fc.property(textArb, textArb, (base, target) => {
        const viaSplice = applyPatch(base, diffToPatch(base, target));
        const viaLegacy = applyDiff(base, lineDiff(base, target));
        expect(viaSplice).toBe(viaLegacy);
      }),
      { numRuns: 300 },
    );
  });
});

describe('diff: differential oracle (L2)', () => {
  it('independent reference agrees with applyPatch', () => {
    fc.assert(
      fc.property(textArb, textArb, (base, target) => {
        const patch = diffToPatch(base, target);
        expect(applySpliceReference(base, patch)).toBe(applyPatch(base, patch));
      }),
      { numRuns: 400 },
    );
  });

  it('empty patch is a no-op', () => {
    fc.assert(
      fc.property(textArb, (base) => {
        expect(diffToPatch(base, base)).toEqual([]);
        expect(applyPatch(base, [])).toBe(base);
      }),
    );
  });
});

describe('diff: format detection (L1)', () => {
  it('accepts any patch produced by diffToPatch', () => {
    fc.assert(
      fc.property(textArb, textArb, (base, target) => {
        expect(isSplicePatch(diffToPatch(base, target))).toBe(true);
      }),
    );
  });

  it('rejects malformed payloads', () => {
    const bad: unknown[] = [
      null,
      'x',
      42,
      {},
      // element-level: each type-guard clause must reject the right shape
      [null],
      [42],
      [[]],
      [{ d: 0, i: [] }],
      [{ s: 0 }],
      [{ s: '0', d: 0, i: [] }],
      [{ s: 0, d: 'x', i: [] }],
      [{ s: 0, d: 0, i: 'no' }],
    ];
    for (const value of bad) expect(isSplicePatch(value), JSON.stringify(value)).toBe(false);
  });

  it('accepts a well-formed splice patch', () => {
    const op: SpliceOp[] = [{ s: 1, d: 1, i: ['x'] }];
    expect(isSplicePatch(op)).toBe(true);
  });
});

describe('diff: edge cases', () => {
  const cases: Array<[string, string]> = [
    ['', ''],
    ['', 'a'],
    ['a', ''],
    ['a\nb\nc', 'a\nc'],
    ['a\nb\nc', 'a\nb\nc\nd'],
    ['x\ny', 'y\nx'],
    ['\n\n\n', ''],
    ['a\n\nb', 'a\nb\nc'],
  ];
  for (const [base, target] of cases) {
    it(`round-trips ${JSON.stringify(base)} -> ${JSON.stringify(target)}`, () => {
      const patch = diffToPatch(base, target);
      expect(applySpliceReference(base, patch)).toBe(target);
      expect(applyPatch(base, patch)).toBe(target);
    });
  }
});

describe('diff: known legacy op shape', () => {
  it('lineDiff emits only valid op tags', () => {
    fc.assert(
      fc.property(textArb, textArb, (base, target) => {
        const ops: DiffOp[] = lineDiff(base, target);
        for (const op of ops) expect(['=', '+', '-']).toContain(op.t);
      }),
    );
  });
});

describe('diff: applyPatch is tolerant of bad offsets', () => {
  it('clamps out-of-range start/del instead of throwing', () => {
    expect(() => applyPatch('a\nb', [{ s: 999, d: 999, i: ['z'] } as SpliceOp])).not.toThrow();
    expect(() => applyPatch('a\nb', [{ s: -5, d: -5, i: [] } as SpliceOp])).not.toThrow();
  });
});
