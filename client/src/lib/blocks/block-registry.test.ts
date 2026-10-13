import { describe, it, expect } from 'vitest';
import { BLOCK_DEFS, blocksByCategory, canDrop, getBlockDef, getBlockDefs, toPayload } from './block-registry';

describe('block-registry', () => {
  it('exposes pattern and modifier blocks', () => {
    expect(getBlockDefs('pattern').length).toBeGreaterThan(0);
    expect(getBlockDefs('effect').some((d) => d.label === 'gain')).toBe(true);
    expect(getBlockDef('effect.gain')?.method).toBe('gain');
  });

  it('groups blocks by category', () => {
    const by = blocksByCategory();
    expect(by.pattern.length).toBeGreaterThan(0);
    expect(by.effect.length).toBeGreaterThan(0);
  });

  it('builds a pattern payload', () => {
    const def = getBlockDefs('pattern')[0];
    expect(toPayload(def)).toMatchObject({ kind: 'pattern' });
  });

  it('builds a combinator payload', () => {
    const def = BLOCK_DEFS.find((d) => d.category === 'combinator' && (d.method === 'stack' || d.method === 'cat'));
    expect(def).toBeDefined();
    if (def) expect(toPayload(def)).toMatchObject({ kind: 'combinator' });
  });

  it('builds a method payload using the shadow default', () => {
    const gain = getBlockDef('effect.gain');
    expect(gain).toBeDefined();
    if (gain) {
      const payload = toPayload(gain);
      expect(payload.kind).toBe('method');
      if (payload.kind === 'method') expect(payload.method.startsWith('.gain(')).toBe(true);
    }
  });

  it('validates drops (never syntactically broken)', () => {
    const pattern = { kind: 'pattern', label: 'kick', code: '$: s("bd")' } as const;
    const method = { kind: 'method', label: 'gain', method: '.gain(0.5)' } as const;
    expect(canDrop(pattern, 'empty')).toBe(true);
    expect(canDrop(pattern, 'pattern')).toBe(true);
    expect(canDrop(method, 'pattern')).toBe(true);
    expect(canDrop(method, 'empty')).toBe(false);
  });
});
