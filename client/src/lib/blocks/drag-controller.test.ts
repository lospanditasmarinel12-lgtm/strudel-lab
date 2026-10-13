import { describe, it, expect } from 'vitest';
import {
  appendToBlock,
  applyDrop,
  insertBlock,
  removeBlockAt,
  replaceBlock,
  snapToBlockBoundary,
  wrapBlock,
} from './drag-controller';
import { parseBlocks } from './parse-blocks';

describe('line operations', () => {
  it('inserts a block with blank-line separation', () => {
    const code = '$: s("bd ~")';
    expect(insertBlock(code, 1, '$: s("~ sd")')).toBe('$: s("~ sd")\n\n$: s("bd ~")');
  });

  it('removes a block', () => {
    const code = '$: s("bd ~")\n\n$: s("~ sd")';
    expect(removeBlockAt(code, 1, 1)).toBe('$: s("~ sd")');
  });

  it('replaces a block', () => {
    const code = '$: s("bd ~")\n\n$: s("~ sd")';
    expect(replaceBlock(code, 1, 1, '$: s("bd bd")')).toBe('$: s("bd bd")\n\n$: s("~ sd")');
  });

  it('appends a method to the last line of a block', () => {
    const code = '$: s("bd ~")';
    expect(appendToBlock(code, 1, 1, '.gain(0.8)')).toBe('$: s("bd ~").gain(0.8)');
  });

  it('appends to a multi-line block last line', () => {
    const code = '$: note("c3")\n  .gain(0.3)';
    expect(appendToBlock(code, 1, 2, '.lpf(800)')).toBe('$: note("c3")\n  .gain(0.3).lpf(800)');
  });

  it('wraps a block in a combinator, stripping the $: label', () => {
    const code = '$: s("bd ~")';
    expect(wrapBlock(code, 1, 1, 'stack')).toBe('stack(\n  s("bd ~")\n)');
  });
});

describe('snapToBlockBoundary', () => {
  it('snaps to the nearest start/end boundary', () => {
    const blocks = parseBlocks('$: s("bd ~")\n\n$: s("~ sd")');
    expect(snapToBlockBoundary(blocks, 1)).toBe(1);
    expect(snapToBlockBoundary(blocks, 2)).toBe(2);
    expect(snapToBlockBoundary(blocks, 3)).toBe(3);
    expect(snapToBlockBoundary(blocks, 4)).toBe(4);
  });
});

describe('applyDrop', () => {
  const code = '$: s("bd ~")\n\n$: s("~ sd")';
  const blocks = parseBlocks(code);

  it('inserts a pattern lego', () => {
    const result = applyDrop(code, blocks, { kind: 'pattern', label: 'hats', code: '$: s("hh hh")' }, 3);
    expect(result).toBe('$: s("bd ~")\n\n$: s("hh hh")\n\n$: s("~ sd")');
  });

  it('appends an effect onto a pattern block', () => {
    const result = applyDrop(code, blocks, { kind: 'method', label: 'gain', method: '.gain(0.5)' }, 1);
    expect(result).toBe('$: s("bd ~").gain(0.5)\n\n$: s("~ sd")');
  });

  it('returns null when an effect is dropped on empty space', () => {
    const result = applyDrop(code, blocks, { kind: 'method', label: 'gain', method: '.gain(0.5)' }, 99);
    expect(result).toBeNull();
  });

  it('wraps a block with a combinator', () => {
    const result = applyDrop(code, blocks, { kind: 'combinator', label: 'stack', wrapper: 'stack' }, 1);
    expect(result).toBe('stack(\n  s("bd ~")\n)\n\n$: s("~ sd")');
  });

  it('reorders a block', () => {
    const result = applyDrop(code, blocks, { kind: 'reorder', label: 'bd', blockId: 'block-0', startLine: 1, endLine: 1 }, 4);
    expect(result).toBe('$: s("~ sd")\n\n$: s("bd ~")');
  });

  it('preserves comment blocks when reordering', () => {
    const withComment = '// intro\n\n$: s("bd ~")\n\n$: s("~ sd")';
    const cblocks = parseBlocks(withComment);
    const result = applyDrop(
      withComment,
      cblocks,
      { kind: 'reorder', label: 'bd', blockId: 'block-1', startLine: 3, endLine: 3 },
      6,
    );
    expect(result).toBe('// intro\n\n$: s("~ sd")\n\n$: s("bd ~")');
  });

  it('no-ops reorder to the same position', () => {
    const result = applyDrop(code, blocks, { kind: 'reorder', label: 'bd', blockId: 'block-0', startLine: 1, endLine: 1 }, 1);
    expect(result).toBeNull();
  });
});
