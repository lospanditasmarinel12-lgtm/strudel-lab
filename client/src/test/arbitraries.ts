import fc from 'fast-check';

/**
 * Shared fast-check arbitraries used across the deep test suites.
 *
 * Nothing here is derived from an implementation under test — these describe
 * the *input domain* (Strudel-ish code, mini-notation, editor line arrays,
 * adversarial field values) so properties can be stated independently.
 */

export const DRUM_TOKENS = ['bd', 'sd', 'hh', 'oh', 'cp', 'rim', 'crash', 'ride'] as const;
export const NOTE_TOKENS = ['c3', 'e3', 'g3', 'b3', 'c4', 'd4', 'f#4'] as const;
export const SYNTHS = ['sawtooth', 'square', 'triangle', 'sine'] as const;

/** Nestable mini-notation atoms: tokens, rests, groups, alternation. */
export const miniAtomArb: fc.Arbitrary<string> = fc.letrec((tie) => ({
  atom: fc.oneof(
    { maxDepth: 3 },
    fc.constant('~'),
    fc.constantFrom(...DRUM_TOKENS, ...NOTE_TOKENS),
    fc.array(tie('atom') as fc.Arbitrary<string>, { minLength: 1, maxLength: 4 }).map((xs) => `[${xs.join(' ')}]`),
    fc.array(tie('atom') as fc.Arbitrary<string>, { minLength: 1, maxLength: 3 }).map((xs) => `<${xs.join(' ')}>`),
  ),
})).atom as fc.Arbitrary<string>;

/** An atom with at most one postfix operator. */
export const miniPostArb: fc.Arbitrary<string> = fc.oneof(
  miniAtomArb,
  fc.tuple(miniAtomArb, fc.integer({ min: 1, max: 8 })).map(([a, n]) => `${a}*${n}`),
  fc.tuple(miniAtomArb, fc.integer({ min: 1, max: 8 })).map(([a, n]) => `${a}/${n}`),
  fc.tuple(miniAtomArb, fc.integer({ min: 1, max: 8 }), fc.integer({ min: 1, max: 8 })).map(([a, f, s]) => `${a}(${f},${s})`),
  fc.tuple(miniAtomArb, fc.integer({ min: 1, max: 8 })).map(([a, n]) => `${a}!${n}`),
  fc.tuple(miniAtomArb, fc.integer({ min: 1, max: 8 })).map(([a, n]) => `${a}@${n}`),
);

/** A mini-notation sequence (space separated). */
export const miniNotationArb: fc.Arbitrary<string> = fc
  .array(miniPostArb, { minLength: 1, maxLength: 6 })
  .map((xs) => xs.join(' '));

/**
 * Adversarial field values: things that break naive formatting loops — quotes,
 * backslashes, newlines/CRLF, control chars, `-0`, `NaN`, `Infinity`, huge ints,
 * and empty strings.
 */
export const fieldValueArb: fc.Arbitrary<string> = fc.oneof(
  fc.constant(''),
  fc.constant('-0'),
  fc.constant('NaN'),
  fc.constant('Infinity'),
  fc.constant('-Infinity'),
  fc.constant('1e309'),
  fc.constant('9007199254740993'), // > MAX_SAFE_INTEGER
  fc.constant('0.1'),
  fc.constant('"quoted"'),
  fc.constant("'single'"),
  fc.constant('a\\b\\c'),
  fc.constant('line\nbreak'),
  fc.constant('crlf\r\nbreak'),
  fc.constant('tab\there'),
  fc.constant('emoji 🎛️'),
  fc.constant('backtick`tick`'),
  fc.constant('comma,sep'),
  fc.constant('paren)close'),
  fc.constant('brack[et'),
  fc.string({ maxLength: 24 }),
);

/** A concrete argument expression accepted on the value path (never quoted by us). */
export const valueExprArb: fc.Arbitrary<string> = fc.oneof(
  fc.constant('sine'),
  fc.constant('sine.range(200,2000)'),
  fc.constant('perlin'),
  fc.constant('rand'),
  fc.constant('0.5'),
  fc.constant('4'),
  fc.constant('x=>x.add(4)'),
  fc.constant('rev()'),
  fc.constant('"bd"'),
);

/** Methods that the catalog models, as source strings. */
export const knownMethodArb: fc.Arbitrary<string> = fc.constantFrom(
  '.gain(0.5)',
  '.lpf(800)',
  '.hpf(200)',
  '.room(0.5)',
  '.delay(0.3)',
  '.pan(-0.5)',
  '.speed(1.5)',
  '.fast(2)',
  '.slow(2)',
  '.rev()',
  '.s("piano")',
  '.s("sawtooth")',
  '.n("0 3 5")',
);

/** Methods the catalog does NOT model (must fall back to the generic block). */
export const unknownMethodArb: fc.Arbitrary<string> = fc.constantFrom(
  '.wobble(3, 0.5)',
  '.madeUpThing(1)',
  '.zzz()',
  '.notARealMethod("x", 2)',
);

/** A single editor line (may be blank/comment-ish). */
export const lineArb: fc.Arbitrary<string> = fc.oneof(
  fc.constant(''),
  fc.constant('  '),
  fc.constant('// comment'),
  fc.constant('/* block */'),
  miniNotationArb.map((m) => `s(${JSON.stringify(m)})`),
  miniNotationArb.map((m) => `note(${JSON.stringify(m)}).s(${JSON.stringify(SYNTHS[0])})`),
);

/** An array of editor lines (used for snapshot/diff properties). */
export const lineArrayArb: fc.Arbitrary<string[]> = fc.array(lineArb, { maxLength: 40 });

/**
 * A plausible Strudel source string: one or more top-level statements, with
 * optional `$:` labels, muted markers, comments and unrepresentable lines.
 */
export const strudelCodeArb: fc.Arbitrary<string> = fc
  .array(
    fc.oneof(
      miniNotationArb.map((m) => `$: s(${JSON.stringify(m)})`),
      fc
        .tuple(miniNotationArb, fc.array(knownMethodArb, { maxLength: 4 }))
        .map(([m, ms]) => `s(${JSON.stringify(m)})${ms.join('')}`),
      fc
        .tuple(miniNotationArb, fc.array(knownMethodArb, { maxLength: 3 }))
        .map(([m, ms]) => `note(${JSON.stringify(m)})${ms.join('')}`),
      fc.tuple(miniNotationArb, unknownMethodArb).map(([m, u]) => `s(${JSON.stringify(m)})${u}`),
      fc.constant('// a comment'),
      fc.constant('const bpm = 120'),
      fc.constant('setcps(0.5)'),
    ),
    { maxLength: 6 },
  )
  .map((blocks) => blocks.join('\n'));

export interface SnapshotSpec {
  entityId: string;
  timestamp: number;
  code: string;
}

/** Monotonically-timestamped snapshot sequences for parser/chain properties. */
export const snapshotSequenceArb: fc.Arbitrary<SnapshotSpec[]> = fc
  .array(
    fc.record<SnapshotSpec>({
      entityId: fc.constantFrom('e0', 'e1', 'e2'),
      timestamp: fc.integer({ min: 0, max: 100_000 }),
      code: lineArrayArb.map((ls) => ls.join('\n')),
    }),
    { maxLength: 30 },
  )
  .map((snaps) => [...snaps].sort((a, b) => a.timestamp - b.timestamp));
