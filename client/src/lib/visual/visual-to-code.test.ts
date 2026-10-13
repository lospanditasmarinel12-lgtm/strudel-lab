import { describe, it, expect } from 'vitest';
import { visualToCode } from './visual-to-code';
import { emptySteps, type GridVisualRow, type VisualModel } from './visual-model';

function drumRow(overrides: Partial<GridVisualRow> = {}): GridVisualRow {
  const steps = emptySteps(4);
  steps[0].on = true;
  steps[2].on = true;
  return {
    id: 'r1',
    kind: 'drum',
    name: 'bd',
    source: 'bd',
    color: '#fff',
    steps,
    effects: [],
    ...overrides,
  };
}

describe('visualToCode', () => {
  it('serializes a drum row with rests and effects', () => {
    const model: VisualModel = {
      stepsPerCycle: 4,
      rows: [drumRow({ effects: [{ name: 'gain', value: 0.8 }, { name: 'rev', value: '' }] })],
    };
    expect(visualToCode(model)).toBe('$: s("bd ~ bd ~").gain(0.8).rev()');
  });

  it('serializes a note row with per-step notes', () => {
    const steps = emptySteps(4);
    steps[0] = { on: true, value: 'c3' };
    steps[2] = { on: true, value: 'e3' };
    const model: VisualModel = {
      stepsPerCycle: 4,
      rows: [{ id: 'r1', kind: 'note', name: 'sawtooth', source: 'sawtooth', color: '#fff', steps, effects: [] }],
    };
    expect(visualToCode(model)).toBe('$: note("c3 ~ e3 ~").s("sawtooth")');
  });

  it('falls back to a note when a melodic step has no value', () => {
    const steps = emptySteps(2);
    steps[0] = { on: true };
    const model: VisualModel = {
      stepsPerCycle: 2,
      rows: [{ id: 'r1', kind: 'note', name: 'sine', source: 'sine', color: '#fff', steps, effects: [] }],
    };
    expect(visualToCode(model)).toBe('$: note("c3 ~").s("sine")');
  });

  it('preserves raw rows verbatim', () => {
    const model: VisualModel = {
      stepsPerCycle: 4,
      rows: [{ id: 'r1', kind: 'raw', name: 'x', color: '#fff', code: 'stack(s("bd"), s("hh"))' }],
    };
    expect(visualToCode(model)).toBe('stack(s("bd"), s("hh"))');
  });

  it('mutes a row by commenting it out', () => {
    const model: VisualModel = { stepsPerCycle: 2, rows: [drumRow({ steps: [{ on: true }, { on: false }], muted: true })] };
    expect(visualToCode(model)).toBe('// [muted] $: s("bd ~")');
  });

  it('joins rows with blank lines', () => {
    const mk = (id: string) => drumRow({ id, steps: [{ on: true }, { on: false }] });
    const model: VisualModel = { stepsPerCycle: 2, rows: [mk('a'), mk('b')] };
    expect(visualToCode(model)).toBe('$: s("bd ~")\n\n$: s("bd ~")');
  });

  it('serializes string-valued effects with quotes', () => {
    const model: VisualModel = { stepsPerCycle: 2, rows: [drumRow({ steps: [{ on: true }, { on: false }], effects: [{ name: 'scale', value: 'C major' }] })] };
    expect(visualToCode(model)).toBe('$: s("bd ~").scale("C major")');
  });
});
