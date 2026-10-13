import { describe, it, expect } from 'vitest';
import { codeToVisual } from './code-to-visual';
import { visualToCode } from './visual-to-code';
import { isGridRow, type GridVisualRow, type VisualModel } from './visual-model';

function gridRows(model: VisualModel): GridVisualRow[] {
  return model.rows.filter(isGridRow) as GridVisualRow[];
}

describe('codeToVisual', () => {
  it('parses a single-sample drum row', () => {
    const model = codeToVisual('$: s("bd ~ bd ~").gain(0.8)');
    expect(model.stepsPerCycle).toBe(4);
    expect(model.rows).toHaveLength(1);
    const row = model.rows[0];
    expect(row.kind).toBe('drum');
    if (isGridRow(row)) {
      expect(row.source).toBe('bd');
      expect(row.steps.map((s) => s.on)).toEqual([true, false, true, false]);
      expect(row.effects).toEqual([{ name: 'gain', value: 0.8 }]);
    }
  });

  it('parses a note row with a sound', () => {
    const model = codeToVisual('$: note("c3 ~ e3 ~").s("sawtooth").lpf(800)');
    const [row] = gridRows(model);
    expect(row.kind).toBe('note');
    expect(row.source).toBe('sawtooth');
    expect(row.steps[0].value).toBe('c3');
    expect(row.steps[2].value).toBe('e3');
    expect(row.effects).toEqual([{ name: 'lpf', value: 800 }]);
  });

  it('joins method chains that span multiple lines', () => {
    const model = codeToVisual('note("c3 e3 g3 b3 c4").s("sawtooth").lpf(800).room(0.5)\n.gain(.3)');
    expect(model.stepsPerCycle).toBe(5);
    const [row] = gridRows(model);
    expect(row.steps.filter((s) => s.on)).toHaveLength(5);
    expect(row.effects.map((e) => e.name)).toEqual(['lpf', 'room', 'gain']);
    expect(row.effects[2].value).toBe(0.3);
  });

  it('preserves multi-sample rows as raw', () => {
    const model = codeToVisual('$: s("bd sd")');
    expect(model.rows[0].kind).toBe('raw');
  });

  it('preserves unsupported mini-notation as raw', () => {
    const model = codeToVisual('$: s("bd(3,8)")');
    expect(model.rows[0].kind).toBe('raw');
  });

  it('preserves unknown modifiers as raw', () => {
    const model = codeToVisual('$: s("bd ~").madeUpThing(3)');
    expect(model.rows[0].kind).toBe('raw');
  });

  it('detects muted rows', () => {
    const model = codeToVisual('// [muted] $: s("bd ~")');
    const [row] = gridRows(model);
    expect(row.muted).toBe(true);
  });

  it('returns a default model for empty code', () => {
    const model = codeToVisual('');
    expect(model.rows).toHaveLength(0);
    expect(model.stepsPerCycle).toBe(16);
  });

  it('round-trips a mixed model through visualToCode', () => {
    const original: VisualModel = {
      stepsPerCycle: 8,
      rows: [
        {
          id: 'a',
          kind: 'drum',
          name: 'bd',
          source: 'bd',
          color: '#f00',
          steps: [
            { on: true },
            { on: false },
            { on: false },
            { on: false },
            { on: true },
            { on: false },
            { on: false },
            { on: false },
          ],
          effects: [{ name: 'gain', value: 0.9 }],
        },
        {
          id: 'b',
          kind: 'note',
          name: 'sawtooth',
          source: 'sawtooth',
          color: '#0f0',
          steps: [
            { on: true, value: 'c3' },
            { on: false },
            { on: true, value: 'g3' },
            { on: false },
            { on: true, value: 'c4' },
            { on: false },
            { on: false },
            { on: false },
          ],
          effects: [],
        },
        { id: 'c', kind: 'raw', name: 'raw', color: '#00f', code: 'stack(s("bd"), s("hh"))' },
      ],
    };

    const roundTripped = codeToVisual(visualToCode(original));
    expect(roundTripped.stepsPerCycle).toBe(8);
    expect(roundTripped.rows).toHaveLength(3);

    const [a, b] = gridRows(roundTripped);
    expect(a.source).toBe('bd');
    expect(a.steps.map((s) => s.on)).toEqual([true, false, false, false, true, false, false, false]);
    expect(a.effects).toEqual([{ name: 'gain', value: 0.9 }]);
    expect(b.steps.filter((s) => s.on).map((s) => s.value)).toEqual(['c3', 'g3', 'c4']);
    expect(roundTripped.rows[2].kind).toBe('raw');
    if (roundTripped.rows[2].kind === 'raw') {
      expect(roundTripped.rows[2].code).toBe('stack(s("bd"), s("hh"))');
    }
  });
});
