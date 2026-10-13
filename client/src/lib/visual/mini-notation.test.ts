import { describe, it, expect } from 'vitest';
import { parseMiniNotation, serializeCells, serializeTree, splitTopLevel } from './mini-notation';
import type { StepTree } from './visual-model';

function roundTrip(s: string): string {
  return serializeCells(parseMiniNotation(s));
}

describe('parseMiniNotation', () => {
  it('parses tokens and rests', () => {
    expect(parseMiniNotation('bd ~ sd')).toEqual([
      { t: 'token', value: 'bd' },
      { t: 'rest' },
      { t: 'token', value: 'sd' },
    ]);
  });

  it('returns [] for empty input', () => {
    expect(parseMiniNotation('')).toEqual([]);
    expect(parseMiniNotation('   ')).toEqual([]);
  });

  it('parses a sequence group', () => {
    const cells = parseMiniNotation('[bd sd] hh');
    expect(cells).toEqual([
      { t: 'group', op: 'seq', children: [{ t: 'token', value: 'bd' }, { t: 'token', value: 'sd' }] },
      { t: 'token', value: 'hh' },
    ]);
  });

  it('parses alternation', () => {
    expect(parseMiniNotation('<bd sd>')).toEqual([
      { t: 'group', op: 'alt', children: [{ t: 'token', value: 'bd' }, { t: 'token', value: 'sd' }] },
    ]);
  });

  it('parses a top-level stack as a single stack cell', () => {
    const cells = parseMiniNotation('bd ~, sd ~');
    expect(cells).toHaveLength(1);
    expect(cells[0].t).toBe('group');
    if (cells[0].t === 'group') expect(cells[0].op).toBe('stack');
  });

  it('parses speed, euclid, repeat, elongate and probability', () => {
    expect(parseMiniNotation('bd*2')[0]).toEqual({
      t: 'group',
      op: 'fast',
      factor: 2,
      children: [{ t: 'token', value: 'bd' }],
    });
    expect(parseMiniNotation('bd/2')[0]).toEqual({
      t: 'group',
      op: 'slow',
      factor: 2,
      children: [{ t: 'token', value: 'bd' }],
    });
    expect(parseMiniNotation('bd(3,8)')[0]).toEqual({
      t: 'euclid',
      fill: 3,
      steps: 8,
      rotate: undefined,
      child: { t: 'token', value: 'bd' },
    });
    expect(parseMiniNotation('bd(3,8,1)')[0]).toEqual({
      t: 'euclid',
      fill: 3,
      steps: 8,
      rotate: 1,
      child: { t: 'token', value: 'bd' },
    });
    expect(parseMiniNotation('bd!3')[0]).toEqual({ t: 'repeat', count: 3, child: { t: 'token', value: 'bd' } });
    expect(parseMiniNotation('bd@2')[0]).toEqual({ t: 'elongate', weight: 2, child: { t: 'token', value: 'bd' } });
    expect(parseMiniNotation('bd?0.5')[0]).toEqual({ t: 'prob', value: 0.5, child: { t: 'token', value: 'bd' } });
  });

  it('throws on malformed input', () => {
    expect(() => parseMiniNotation('[bd sd')).toThrow();
    expect(() => parseMiniNotation('bd(3)')).toThrow();
  });
});

describe('serialize', () => {
  const samples = [
    'bd ~ sd ~',
    '[bd sd] hh',
    '<bd sd> hh',
    'bd(3,8)',
    'bd(3,8,1)',
    'bd!3',
    'bd@2',
    'bd?0.5',
    'bd*2',
    'bd/2',
    'bd ~, sd ~',
    '[bd [sd sd]] hh*2',
  ];

  it.each(samples)('round-trips %s', (s) => {
    expect(roundTrip(s)).toBe(s);
  });

  it.each(samples)('is idempotent for %s', (s) => {
    const once = serializeCells(parseMiniNotation(s));
    const twice = serializeCells(parseMiniNotation(once));
    expect(twice).toBe(once);
  });
});

describe('splitTopLevel', () => {
  it('ignores commas inside brackets', () => {
    expect(splitTopLevel('a, [b, c], d')).toEqual(['a', ' [b, c]', ' d']);
  });
});

describe('serializeTree', () => {
  it('serializes a nested tree', () => {
    const tree: StepTree = {
      t: 'group',
      op: 'seq',
      children: [
        { t: 'token', value: 'bd' },
        { t: 'group', op: 'fast', factor: 2, children: [{ t: 'token', value: 'sd' }] },
      ],
    };
    expect(serializeTree(tree)).toBe('[bd sd*2]');
  });
});
