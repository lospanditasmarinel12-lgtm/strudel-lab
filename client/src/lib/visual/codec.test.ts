import { describe, it, expect } from 'vitest';
import { parse, serialize, canonicalize, isIdempotent, rawCodesPreserved, toLegacyVisualModel } from './codec';
import { isGridRow } from './visual-model';

const SAMPLES = [
  '$: s("bd ~ bd ~").gain(0.8)',
  '$: note("c3 ~ e3 ~").s("sawtooth").lpf(800)',
  '$: s("bd sd")',
  'stack(s("bd"), s("hh"))',
  '$: s("bd ~").madeUpThing(3)',
  '// [muted] $: s("bd ~")',
  '$: s("bd")\n\n$: s("sd")',
  '$: note("c3 e3")\n.gain(0.3)',
];

describe('codec', () => {
  it('serializes then parses deterministically', () => {
    for (const code of SAMPLES) {
      expect(canonicalize(code)).toBe(serialize(parse(code)));
    }
  });

  it('is idempotent for all samples', () => {
    for (const code of SAMPLES) {
      expect(isIdempotent(code)).toBe(true);
    }
  });

  it('preserves raw regions byte-for-byte', () => {
    for (const code of SAMPLES) {
      expect(rawCodesPreserved(code)).toBe(true);
    }
  });
});

describe('toLegacyVisualModel', () => {
  it('maps a single-sample drum section to a grid row', () => {
    const vm = toLegacyVisualModel(parse('$: s("bd ~ bd ~").gain(0.8)'));
    expect(vm.stepsPerCycle).toBe(4);
    const row = vm.rows[0];
    expect(isGridRow(row)).toBe(true);
    if (isGridRow(row)) {
      expect(row.kind).toBe('drum');
      expect(row.source).toBe('bd');
      expect(row.steps.map((s) => s.on)).toEqual([true, false, true, false]);
      expect(row.effects).toEqual([{ name: 'gain', value: 0.8 }]);
    }
  });

  it('maps a note section to a note row', () => {
    const vm = toLegacyVisualModel(parse('$: note("c3 ~ e3 ~").s("sine")'));
    const row = vm.rows[0];
    expect(isGridRow(row)).toBe(true);
    if (isGridRow(row)) {
      expect(row.kind).toBe('note');
      expect(row.source).toBe('sine');
      expect(row.steps[0]).toEqual({ on: true, value: 'c3' });
    }
  });

  it('preserves multi-sample rows as raw (legacy rule)', () => {
    const vm = toLegacyVisualModel(parse('$: s("bd sd")'));
    expect(vm.rows[0].kind).toBe('raw');
  });

  it('preserves containers as raw', () => {
    const vm = toLegacyVisualModel(parse('stack(s("bd"), s("hh"))'));
    expect(vm.rows[0].kind).toBe('raw');
  });

  it('returns a default step count for empty code', () => {
    const vm = toLegacyVisualModel(parse(''));
    expect(vm.rows).toHaveLength(0);
    expect(vm.stepsPerCycle).toBe(16);
  });
});
