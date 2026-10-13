import { describe, it, expect } from 'vitest';
import { lineDiff, applyDiff } from './diff';

describe('lineDiff', () => {
  it('returns empty ops for identical strings', () => {
    const ops = lineDiff('hello\nworld', 'hello\nworld');
    expect(ops.length).toBe(1);
    expect(ops[0].t).toBe('=');
  });

  it('detects added lines', () => {
    const ops = lineDiff('a\nb', 'a\nb\nc');
    const adds = ops.filter(o => o.t === '+');
    expect(adds.length).toBeGreaterThanOrEqual(1);
    expect(adds.some(o => o.l.includes('c'))).toBe(true);
  });

  it('detects removed lines', () => {
    const ops = lineDiff('a\nb\nc', 'a\nc');
    const removes = ops.filter(o => o.t === '-');
    expect(removes.length).toBeGreaterThanOrEqual(1);
  });

  it('handles complete replacement', () => {
    const ops = lineDiff('a\nb', 'c\nd');
    expect(ops.some(o => o.t === '-')).toBe(true);
    expect(ops.some(o => o.t === '+')).toBe(true);
  });

  it('handles empty old string', () => {
    const ops = lineDiff('', 'a\nb');
    // '' splits to [''] which is removed, then 'a','b' are added
    expect(ops.length).toBeGreaterThan(0);
    expect(ops.some(o => o.t === '+')).toBe(true);
  });

  it('handles empty new string', () => {
    const ops = lineDiff('a\nb', '');
    // 'a','b' are removed, '' splits to [''] which is kept
    expect(ops.length).toBeGreaterThan(0);
    expect(ops.some(o => o.t === '-')).toBe(true);
  });

  it('handles both empty strings', () => {
    const ops = lineDiff('', '');
    // '' splits to [''] → match → one '=' op
    expect(ops.length).toBe(1);
    expect(ops[0].t).toBe('=');
  });
});

describe('applyDiff', () => {
  it('reconstructs identical string', () => {
    const result = applyDiff('hello\nworld', [{ t: '=', l: ['hello', 'world'] }]);
    expect(result).toBe('hello\nworld');
  });

  it('applies additions', () => {
    const result = applyDiff('a\nb', [
      { t: '=', l: ['a', 'b'] },
      { t: '+', l: ['c'] },
    ]);
    expect(result).toBe('a\nb\nc');
  });

  it('applies removals', () => {
    const result = applyDiff('a\nb\nc', [
      { t: '=', l: ['a'] },
      { t: '-', l: ['b'] },
      { t: '=', l: ['c'] },
    ]);
    expect(result).toBe('a\nc');
  });

  it('applies mixed ops', () => {
    const result = applyDiff('line1\nline2\nline3', [
      { t: '=', l: ['line1'] },
      { t: '-', l: ['line2'] },
      { t: '+', l: ['new2'] },
      { t: '=', l: ['line3'] },
    ]);
    expect(result).toBe('line1\nnew2\nline3');
  });

  it('round-trips with lineDiff', () => {
    const old = 'a\nb\nc\nd';
    const n = 'a\nx\nc\ny';
    const ops = lineDiff(old, n);
    const reconstructed = applyDiff(old, ops);
    expect(reconstructed).toBe(n);
  });

  it('round-trips empty to something', () => {
    const ops = lineDiff('', 'hello\nworld');
    expect(applyDiff('', ops)).toBe('hello\nworld');
  });

  it('round-trips something to empty', () => {
    const ops = lineDiff('a\nb', '');
    expect(applyDiff('a\nb', ops)).toBe('');
  });
});
