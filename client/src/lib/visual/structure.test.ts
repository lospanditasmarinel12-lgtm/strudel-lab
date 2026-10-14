import { describe, it, expect } from 'vitest';
import { parseStructure, serializeStructure } from './structure';
import type { ContainerNode, GridPatternNode, SectionNode } from './visual-model';

function sectionAt(code: string, i = 0): SectionNode {
  const node = parseStructure(code).nodes[i];
  expect(node.kind).toBe('section');
  return node as SectionNode;
}

describe('parseStructure', () => {
  it('parses a drum section with effects', () => {
    const node = sectionAt('$: s("bd ~").gain(0.8)');
    expect(node.muted).toBe(false);
    const pattern = node.pattern as GridPatternNode;
    expect(pattern.kind).toBe('grid');
    expect(pattern.rowKind).toBe('drum');
    expect(pattern.steps).toEqual([
      { t: 'token', value: 'bd' },
      { t: 'rest' },
    ]);
    expect(pattern.effects).toEqual([{ name: 'gain', value: 0.8 }]);
  });

  it('parses a note section with a sound', () => {
    const node = sectionAt('$: note("c3 ~ e3 ~").s("sawtooth").lpf(800)');
    const pattern = node.pattern as GridPatternNode;
    expect(pattern.rowKind).toBe('note');
    expect(pattern.sound).toBe('sawtooth');
    expect(pattern.effects).toEqual([{ name: 'lpf', value: 800 }]);
  });

  it('represents multi-sample rows (new capability)', () => {
    const node = sectionAt('$: s("bd sd")');
    const pattern = node.pattern as GridPatternNode;
    expect(pattern.kind).toBe('grid');
    expect(pattern.steps).toEqual([
      { t: 'token', value: 'bd' },
      { t: 'token', value: 'sd' },
    ]);
  });

  it('represents a chord as a stack cell (authoritative parser)', () => {
    const node = sectionAt('$: note("c3 [e3,g3]").s("sine")');
    const pattern = node.pattern as GridPatternNode;
    expect(pattern.kind).toBe('grid');
    const chord = pattern.steps[1];
    expect(chord.t).toBe('group');
    if (chord.t === 'group') expect(chord.op).toBe('stack');
  });

  it('represents a `-` rest alias', () => {
    const node = sectionAt('$: s("bd - sd")');
    const pattern = node.pattern as GridPatternNode;
    expect(pattern.steps).toEqual([
      { t: 'token', value: 'bd' },
      { t: 'rest' },
      { t: 'token', value: 'sd' },
    ]);
  });

  it('parses `sound(...)` as a drum alias', () => {
    const node = sectionAt('$: sound("bd ~ sd")');
    const pattern = node.pattern as GridPatternNode;
    expect(pattern.rowKind).toBe('drum');
    expect(pattern.factory).toBe('sound');
    expect(serializeStructure(parseStructure('$: sound("bd ~ sd")'))).toBe('$: sound("bd ~ sd")');
  });

  it('parses `n(...)` and preserves the factory', () => {
    const node = sectionAt('$: n("0 1 2 3").s("jazz")');
    const pattern = node.pattern as GridPatternNode;
    expect(pattern.rowKind).toBe('note');
    expect(pattern.factory).toBe('n');
    expect(pattern.sound).toBe('jazz');
    expect(serializeStructure(parseStructure('$: n("0 1 2 3").s("jazz")'))).toBe('$: n("0 1 2 3").s("jazz")');
  });

  it('parses `.bank("…")` as an effect', () => {
    const node = sectionAt('$: s("bd sd").bank("RolandTR909")');
    const pattern = node.pattern as GridPatternNode;
    expect(pattern.effects).toEqual([{ name: 'bank', value: 'RolandTR909' }]);
  });

  it('parses stack/cat containers', () => {
    const node = parseStructure('stack(s("bd"), s("hh"))').nodes[0] as ContainerNode;
    expect(node.kind).toBe('container');
    expect(node.op).toBe('stack');
    expect(node.children).toHaveLength(2);
    expect((node.children[0] as GridPatternNode).steps).toEqual([{ t: 'token', value: 'bd' }]);
  });

  it('preserves unknown modifiers as raw effects (keeps the block editable)', () => {
    const node = sectionAt('$: s("bd ~").madeUpThing(3)');
    const pattern = node.pattern as GridPatternNode;
    expect(pattern.kind).toBe('grid');
    expect(pattern.effects).toEqual([{ name: 'madeUpThing', value: 3 }]);
    expect(serializeStructure(parseStructure('$: s("bd ~").madeUpThing(3)'))).toBe('$: s("bd ~").madeUpThing(3)');
  });

  it('preserves function-valued args verbatim (`.jux(rev)`)', () => {
    const node = sectionAt('$: s("bd sd").jux(rev)');
    const pattern = node.pattern as GridPatternNode;
    expect(pattern.effects).toEqual([{ name: 'jux', value: 'rev', raw: true }]);
    expect(serializeStructure(parseStructure('$: s("bd sd").jux(rev)'))).toBe('$: s("bd sd").jux(rev)');
  });

  it('preserves multi-arg / arrow-fn args verbatim (`.off(...)`)', () => {
    const code = '$: note("c3 e3").s("sine").off(1/16, x=>x.add(4))';
    const node = sectionAt(code);
    const pattern = node.pattern as GridPatternNode;
    expect(pattern.effects[0]).toMatchObject({ name: 'off', raw: true });
    expect(serializeStructure(parseStructure(code))).toBe(code);
  });

  it('preserves signal args verbatim (`.speed(perlin.range(0,1))`)', () => {
    const code = '$: s("bd").speed(perlin.range(0,1))';
    const node = sectionAt(code);
    const pattern = node.pattern as GridPatternNode;
    expect(pattern.effects[0]).toMatchObject({ name: 'speed', raw: true });
    expect(serializeStructure(parseStructure(code))).toBe(code);
  });

  it('marks muted sections', () => {
    const node = sectionAt('// [muted] $: s("bd ~")');
    expect(node.muted).toBe(true);
  });

  it('joins multi-line method chains', () => {
    const node = sectionAt('note("c3 e3")\n.gain(0.3)\n.lpf(800)');
    const pattern = node.pattern as GridPatternNode;
    expect(pattern.effects.map((e) => e.name)).toEqual(['gain', 'lpf']);
  });

  it('splits consecutive $: blocks without blank lines', () => {
    const model = parseStructure('$: s("bd")\n$: s("sd")');
    expect(model.nodes).toHaveLength(2);
  });

  it('assigns stable ids and source ranges', () => {
    const model = parseStructure('$: s("bd")\n\n$: s("sd")');
    expect(model.nodes[0].id).toBe('node-0');
    expect(model.nodes[1].id).toBe('node-1');
    expect(model.nodes[1].src).toMatchObject({ startLine: 3, endLine: 3 });
  });
});

describe('serializeStructure', () => {
  it('round-trips simple code', () => {
    const code = '$: s("bd ~ bd ~").gain(0.8)';
    expect(serializeStructure(parseStructure(code))).toBe(code);
  });

  it('serializes muted sections', () => {
    const code = '// [muted] $: s("bd ~")';
    expect(serializeStructure(parseStructure(code))).toBe(code);
  });

  it('serializes containers in canonical multi-line form', () => {
    const out = serializeStructure(parseStructure('stack(s("bd"), s("hh"))'));
    expect(out).toBe('stack(\n  s("bd"),\n  s("hh")\n)');
  });

  it('preserves raw nodes verbatim', () => {
    const code = '$: s("bd ~").madeUpThing(3)';
    expect(serializeStructure(parseStructure(code))).toBe(code);
  });

  it('is idempotent', () => {
    const code = '$: s("bd ~")\n\nstack(s("hh"), s("cp"))\n\n$: note("c3 e3").s("sine")';
    const once = serializeStructure(parseStructure(code));
    const twice = serializeStructure(parseStructure(once));
    expect(twice).toBe(once);
  });
});
