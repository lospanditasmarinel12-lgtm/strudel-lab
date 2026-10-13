import { describe, it, expect } from 'vitest';
import { parseBlocks, blocksSignature, findBlockAtLine, barBlocks } from './parse-blocks';

describe('parseBlocks', () => {
  it('parses consecutive $: lines as separate blocks', () => {
    const blocks = parseBlocks('$: s("bd ~ bd ~")\n$: s("~ sd ~ sd")');
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ kind: 'pattern', startLine: 1, endLine: 1 });
    expect(blocks[1]).toMatchObject({ kind: 'pattern', startLine: 2, endLine: 2 });
    expect(blocks[0].row?.source).toBe('bd');
    expect(blocks[1].row?.source).toBe('sd');
  });

  it('groups a multi-line method chain into one pattern block', () => {
    const blocks = parseBlocks('$: note("c3")\n  .gain(0.3)\n  .lpf(800)');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: 'pattern', startLine: 1, endLine: 3 });
    expect(blocks[0].row?.effects.map((e) => e.name)).toEqual(['gain', 'lpf']);
  });

  it('separates blocks by blank lines', () => {
    const blocks = parseBlocks('$: s("bd ~")\n\n$: s("~ sd")');
    expect(blocks).toHaveLength(2);
    expect(blocks[1].startLine).toBe(3);
  });

  it('classifies combinators as raw blocks', () => {
    const blocks = parseBlocks('stack(\n  s("bd"),\n  s("hh")\n)');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('raw');
    expect(blocks[0].row).toBeUndefined();
  });

  it('keeps comment blocks but they get no bar', () => {
    const blocks = parseBlocks('// a comment\n// another\n\n$: s("bd ~")');
    expect(blocks).toHaveLength(2);
    expect(blocks[0].kind).toBe('comment');
    expect(blocks[1].kind).toBe('pattern');
    expect(blocks[1].startLine).toBe(4);
    expect(barBlocks(blocks)).toHaveLength(1);
  });

  it('recognizes muted blocks as patterns', () => {
    const blocks = parseBlocks('// [muted] $: s("bd ~")');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('pattern');
    expect(blocks[0].row?.muted).toBe(true);
  });

  it('gives stable ids by position', () => {
    const a = parseBlocks('$: s("bd ~")\n$: s("~ sd")');
    const b = parseBlocks('$: s("bd ~ bd ~")\n$: s("~ sd ~ sd")');
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
  });

  it('signature ignores content but tracks ranges', () => {
    const a = parseBlocks('$: s("bd ~")');
    const b = parseBlocks('$: s("bd bd bd bd")');
    expect(blocksSignature(a)).toBe(blocksSignature(b));
    const c = parseBlocks('$: s("bd ~")\n$: s("~ sd")');
    expect(blocksSignature(a)).not.toBe(blocksSignature(c));
  });

  it('findBlockAtLine resolves ranges', () => {
    const blocks = parseBlocks('$: s("bd ~")\n$: s("~ sd")');
    expect(findBlockAtLine(blocks, 2)?.row?.source).toBe('sd');
    expect(findBlockAtLine(blocks, 99)).toBeUndefined();
  });
});
