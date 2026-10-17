import { beforeAll, describe, expect, test } from 'vitest';
import fc from 'fast-check';
import * as Blockly from 'blockly/core';
import { initBlockly } from '@/lib/blockly';
import { StrudelGenerator, installGenerators } from '@/lib/blockly/strudel-generator';
import { codeToSerialization } from '@/lib/blockly/ast-to-blocks';
import { isParseable, semanticSignature } from '@/test/oracles/strudel';
import { miniNotationArb, knownMethodArb, unknownMethodArb } from '@/test/arbitraries';
import { corpus } from '@/test/corpus';

/**
 * Property + corpus tests for the Blockly bridge.
 *
 * Oracles:
 *  - L1: idempotence / fixpoint of `code -> blocks -> code`.
 *  - L2: generated code must re-parse with acorn (independent parser), and
 *        representable code must round-trip byte-exactly.
 *  - L4: the real corpus must survive the pipeline without crashing or losing
 *        parseability.
 */

function roundTrip(code: string): string {
  const ws = new Blockly.Workspace();
  const gen = new StrudelGenerator();
  installGenerators(gen);
  Blockly.serialization.workspaces.load(
    codeToSerialization(code) as unknown as Parameters<typeof Blockly.serialization.workspaces.load>[0],
    ws,
  );
  const out = gen.workspaceToCode(ws).trim();
  ws.dispose();
  return out;
}

beforeAll(() => initBlockly());

/** Code the bridge is expected to represent exactly. */
const representableArb: fc.Arbitrary<string> = fc
  .array(
    fc.oneof(
      miniNotationArb.map((m) => `$: s(${JSON.stringify(m)})`),
      fc
        .tuple(miniNotationArb, fc.array(knownMethodArb, { maxLength: 4 }))
        .map(([m, ms]) => `s(${JSON.stringify(m)})${ms.join('')}`),
      fc
        .tuple(miniNotationArb, fc.array(knownMethodArb, { maxLength: 3 }))
        .map(([m, ms]) => `note(${JSON.stringify(m)})${ms.join('')}`),
      fc.constant('setcps(0.5)'),
    ),
    { maxLength: 5 },
  )
  .map((blocks) => blocks.join('\n'));

/** Arbitrary, potentially unrepresentable code. */
const anyCodeArb: fc.Arbitrary<string> = fc.oneof(
  fc.string({ maxLength: 200 }),
  representableArb,
  fc.tuple(miniNotationArb, unknownMethodArb).map(([m, u]) => `s(${JSON.stringify(m)})${u}`),
  fc.constant('const bpm = 120\ns("bd")'),
  miniNotationArb.map((m) => `// a comment\n$: s(${JSON.stringify(m)})\n`),
);

describe('fuzz: blockly bridge invariants', () => {
  test('never throws on arbitrary code', () => {
    fc.assert(
      fc.property(anyCodeArb, (code) => {
        expect(() => roundTrip(code)).not.toThrow();
      }),
      { numRuns: 300 },
    );
  });

  test('round-trip is idempotent', () => {
    fc.assert(
      fc.property(anyCodeArb, (code) => {
        const once = roundTrip(code);
        expect(roundTrip(once)).toBe(once);
      }),
      { numRuns: 300 },
    );
  });

  test('representable code round-trips byte-exactly', () => {
    fc.assert(
      fc.property(representableArb, (code) => {
        expect(roundTrip(code)).toBe(code);
      }),
      { numRuns: 300 },
    );
  });

  test('generated code from parseable input is always parseable', () => {
    fc.assert(
      fc.property(anyCodeArb, (code) => {
        fc.pre(isParseable(code));
        const out = roundTrip(code);
        expect(isParseable(out)).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  test('round-trip preserves the semantic signature of representable code', () => {
    fc.assert(
      fc.property(representableArb, (code) => {
        expect(semanticSignature(roundTrip(code))).toBe(semanticSignature(code));
      }),
      { numRuns: 200 },
    );
  });
});

describe('fuzz: blockly bridge corpus (L4)', () => {
  const entries = corpus(true);

  test('every corpus pattern survives the pipeline', () => {
    for (const entry of entries) {
      expect(() => roundTrip(entry.code), entry.id).not.toThrow();
    }
  });

  test('every corpus pattern is idempotent under the bridge', () => {
    for (const entry of entries) {
      const once = roundTrip(entry.code);
      expect(roundTrip(once), entry.id).toBe(once);
    }
  });

  test('parseable corpus input never becomes unparseable output', () => {
    for (const entry of entries) {
      if (!isParseable(entry.code)) continue;
      expect(isParseable(roundTrip(entry.code)), entry.id).toBe(true);
    }
  });
});
