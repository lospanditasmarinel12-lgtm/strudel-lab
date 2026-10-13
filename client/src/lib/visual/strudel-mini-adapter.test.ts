import { describe, it, expect } from 'vitest';
import { miniNotationToTree } from './strudel-mini-adapter';
import { serializeCells } from './mini-notation';
import type { StepTree } from './visual-model';

function roundTrip(s: string): string {
  return serializeCells(miniNotationToTree(s));
}

describe('strudel-mini-adapter (authoritative parsing)', () => {
  it('parses a sequence with a nested group', () => {
    const cells = miniNotationToTree('bd ~ [sd cp]');
    expect(cells[0]).toEqual({ t: 'token', value: 'bd' });
    expect(cells[1]).toEqual({ t: 'rest' });
    expect(cells[2]).toEqual({
      t: 'group',
      op: 'seq',
      children: [{ t: 'token', value: 'sd' }, { t: 'token', value: 'cp' }],
    });
  });

  it('parses angle-bracket alternation with speed', () => {
    const cells = miniNotationToTree('<hh oh>*2');
    expect(cells).toHaveLength(1);
    const g = cells[0] as Extract<StepTree, { t: 'group' }>;
    expect(g.op).toBe('fast');
    expect(g.children[0].t).toBe('group');
  });

  it('parses euclid, repeat, elongate, probability', () => {
    expect(miniNotationToTree('bd(3,8)')[0]).toMatchObject({ t: 'euclid', fill: 3, steps: 8 });
    expect(miniNotationToTree('bd!3')[0]).toMatchObject({ t: 'repeat', count: 3 });
    expect(miniNotationToTree('bd@2')[0]).toMatchObject({ t: 'elongate', weight: 2 });
    expect(miniNotationToTree('bd?0.5')[0]).toMatchObject({ t: 'prob', value: 0.5 });
    // Bare `?` defaults to 0.5.
    expect(miniNotationToTree('bd?')[0]).toMatchObject({ t: 'prob', value: 0.5 });
  });

  it('treats `-` as a rest (rest alias)', () => {
    expect(miniNotationToTree('bd - sd')).toEqual([
      { t: 'token', value: 'bd' },
      { t: 'rest' },
      { t: 'token', value: 'sd' },
    ]);
  });

  it('parses a chord as a single stack cell', () => {
    const cells = miniNotationToTree('[g3,b3,e4]');
    expect(cells).toHaveLength(1);
    const g = cells[0] as Extract<StepTree, { t: 'group' }>;
    expect(g.op).toBe('stack');
    expect(g.top).toBeFalsy();
    expect(g.children).toHaveLength(3);
  });

  it('parses a top-level comma as a top stack', () => {
    const cells = miniNotationToTree('a b, c d');
    expect(cells).toHaveLength(1);
    const g = cells[0] as Extract<StepTree, { t: 'group' }>;
    expect(g.op).toBe('stack');
    expect(g.top).toBe(true);
  });

  it('round-trips canonical forms (idempotent)', () => {
    const samples = [
      'bd ~ [sd cp]',
      '<hh oh>*2',
      'bd(3,8)',
      'bd!3',
      'bd@2',
      'bd?0.5',
      '[g3, b3, e4]',
      'a b, c d',
      'bd/2',
      'c3 e3 g3',
    ];
    for (const s of samples) {
      const once = roundTrip(s);
      const twice = roundTrip(once);
      expect(twice).toBe(once);
    }
  });

  it('serializes a chord with brackets and a top stack without', () => {
    expect(roundTrip('[g3,b3,e4]')).toBe('[g3, b3, e4]');
    expect(roundTrip('a b, c d')).toBe('a b, c d');
  });

  it('parses random choice (`|`)', () => {
    const nested = miniNotationToTree('[a|b|c]');
    expect(nested).toHaveLength(1);
    const g = nested[0] as Extract<StepTree, { t: 'group' }>;
    expect(g.op).toBe('choice');
    expect(g.top).toBeFalsy();

    const top = miniNotationToTree('a | b');
    expect(top).toHaveLength(1);
    const t = top[0] as Extract<StepTree, { t: 'group' }>;
    expect(t.op).toBe('choice');
    expect(t.top).toBe(true);
  });

  it('serializes choice with/without brackets', () => {
    expect(roundTrip('[a|b|c]')).toBe('[a | b | c]');
    expect(roundTrip('a | b')).toBe('a | b');
  });

  it('treats `_` as elongation of the previous event', () => {
    const cells = miniNotationToTree('a _ b');
    expect(cells[0]).toEqual({ t: 'elongate', weight: 2, child: { t: 'token', value: 'a' } });
    expect(cells[1]).toEqual({ t: 'token', value: 'b' });
  });

  it('treats newlines as whitespace (multi-line strings)', () => {
    expect(miniNotationToTree('bd\nsd')).toEqual([
      { t: 'token', value: 'bd' },
      { t: 'token', value: 'sd' },
    ]);
  });
});
