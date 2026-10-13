import { describe, expect, test } from 'vitest';
import fc from 'fast-check';
import { parseMiniNotation, serializeCells } from '@/lib/visual/mini-notation';
import { isIdempotent, rawCodesPreserved, canonicalize } from '@/lib/visual/codec';

/**
 * Property-based tests for the visual codec:
 *  - mini-notation serialize/parse is a fixed point (idempotent), and
 *  - whole-file parse/serialize is idempotent and preserves raw regions.
 */

const atomStr: fc.Arbitrary<string> = fc.letrec((tie) => ({
  atom: fc.oneof(
    { depthSize: 'large' },
    fc.constant('~'),
    fc.constantFrom('bd', 'sd', 'hh', 'cp', 'c3', 'e3', 'g3'),
    fc.array(tie('atom') as fc.Arbitrary<string>, { minLength: 1, maxLength: 4 }).map((xs) => `[${xs.join(' ')}]`),
    fc.array(tie('atom') as fc.Arbitrary<string>, { minLength: 1, maxLength: 3 }).map((xs) => `<${xs.join(' ')}>`),
  ),
})).atom as fc.Arbitrary<string>;

const postStr: fc.Arbitrary<string> = fc.oneof(
  atomStr,
  fc.tuple(atomStr, fc.integer({ min: 1, max: 8 })).map(([a, n]) => `${a}*${n}`),
  fc.tuple(atomStr, fc.integer({ min: 1, max: 8 })).map(([a, n]) => `${a}/${n}`),
  fc.tuple(atomStr, fc.integer({ min: 1, max: 8 }), fc.integer({ min: 1, max: 8 })).map(([a, f, s]) => `${a}(${f},${s})`),
  fc.tuple(atomStr, fc.integer({ min: 1, max: 8 })).map(([a, n]) => `${a}!${n}`),
  fc.tuple(atomStr, fc.integer({ min: 1, max: 8 })).map(([a, n]) => `${a}@${n}`),
);

const seqStr: fc.Arbitrary<string> = fc.array(postStr, { maxLength: 8 }).map((xs) => xs.join(' '));

const blockStr: fc.Arbitrary<string> = fc.oneof(
  seqStr.map((s) => `$: s(${JSON.stringify(s)})`),
  seqStr.map((s) => `$: note(${JSON.stringify(s)}).s("sine")`),
  fc.constant('$: s("bd").madeUpThing(3)'),
  fc.constant('setcps(0.5)'),
  fc.constant('stack(s("bd"), s("hh"))'),
);

const codeArb: fc.Arbitrary<string> = fc.array(blockStr, { maxLength: 5 }).map((bs) => bs.join('\n\n'));

describe('fuzz: visual mini-notation', () => {
  test('serialize(parse(s)) is a fixed point', () => {
    fc.assert(
      fc.property(seqStr, (s) => {
        const once = serializeCells(parseMiniNotation(s));
        const twice = serializeCells(parseMiniNotation(once));
        expect(twice).toBe(once);
      }),
      { numRuns: 300 },
    );
  });
});

describe('fuzz: visual codec', () => {
  test('whole-file parse/serialize is idempotent', () => {
    fc.assert(
      fc.property(codeArb, (code) => {
        expect(isIdempotent(code)).toBe(true);
        expect(canonicalize(code)).toBe(canonicalize(canonicalize(code)));
      }),
      { numRuns: 200 },
    );
  });

  test('raw regions are preserved byte-for-byte', () => {
    fc.assert(
      fc.property(codeArb, (code) => {
        expect(rawCodesPreserved(code)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});
