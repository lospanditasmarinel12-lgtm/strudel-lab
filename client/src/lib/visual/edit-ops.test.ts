import { describe, it, expect } from 'vitest';
import { parse, serialize } from './codec';
import {
  addEffect,
  addNode,
  duplicateContainerChild,
  duplicateNode,
  moveContainerChild,
  moveNode,
  removeContainerChild,
  removeEffect,
  removeNode,
  setCell,
  setEffect,
  setMuted,
  setSound,
  wrapInContainer,
} from './edit-ops';
import type { GridPatternNode, SectionNode } from './visual-model';

const CODE = '$: s("bd ~ bd ~").gain(0.8)\n\n$: s("~ sd ~ sd")';

function gridOf(model: ReturnType<typeof parse>, id: string): GridPatternNode {
  const node = model.nodes.find((n) => n.id === id) as SectionNode;
  return node.pattern as GridPatternNode;
}

describe('edit-ops', () => {
  it('does not mutate the input model', () => {
    const model = parse(CODE);
    const before = serialize(model);
    removeNode(model, model.nodes[0].id);
    expect(serialize(model)).toBe(before);
  });

  it('removeNode drops a section', () => {
    const model = parse(CODE);
    const out = removeNode(model, model.nodes[0].id);
    expect(out.nodes).toHaveLength(1);
    expect(serialize(out)).toBe('$: s("~ sd ~ sd")');
  });

  it('moveNode reorders sections', () => {
    const model = parse(CODE);
    const out = moveNode(model, model.nodes[1].id, 0);
    expect(serialize(out)).toBe('$: s("~ sd ~ sd")\n\n$: s("bd ~ bd ~").gain(0.8)');
  });

  it('duplicateNode inserts a copy after the original', () => {
    const model = parse('$: s("bd")');
    const out = duplicateNode(model, model.nodes[0].id);
    expect(out.nodes).toHaveLength(2);
    expect(out.nodes[0].id).not.toBe(out.nodes[1].id);
  });

  it('addNode appends', () => {
    const model = parse('$: s("bd")');
    const extra = parse('$: s("sd")').nodes[0];
    const out = addNode(model, extra);
    expect(out.nodes).toHaveLength(2);
  });

  it('setMuted toggles the muted prefix', () => {
    const model = parse('$: s("bd ~")');
    const out = setMuted(model, model.nodes[0].id, true);
    expect(serialize(out)).toBe('// [muted] $: s("bd ~")');
  });

  it('wrapInContainer builds a stack', () => {
    const model = parse('$: s("bd ~")\n\n$: s("~ sd")');
    const ids = model.nodes.map((n) => n.id);
    const out = wrapInContainer(model, ids, 'stack');
    expect(out.nodes).toHaveLength(1);
    expect(out.nodes[0].kind).toBe('container');
    expect(serialize(out)).toBe('stack(\n  s("bd ~"),\n  s("~ sd")\n)');
  });

  it('edits container children (remove / move / duplicate)', () => {
    const model = parse('stack(s("bd"), s("hh"), s("cp"))');
    const cid = model.nodes[0].id;

    const removed = removeContainerChild(model, cid, 1);
    expect(serialize(removed)).toBe('stack(\n  s("bd"),\n  s("cp")\n)');

    const moved = moveContainerChild(model, cid, 0, 2);
    expect(serialize(moved)).toBe('stack(\n  s("hh"),\n  s("cp"),\n  s("bd")\n)');

    const dup = duplicateContainerChild(model, cid, 0);
    const container = dup.nodes[0];
    if (container.kind === 'container') expect(container.children).toHaveLength(4);
  });

  it('setCell updates one step', () => {
    const model = parse('$: s("bd ~")');
    const id = model.nodes[0].id;
    const out = setCell(model, id, 1, { t: 'token', value: 'sd' });
    expect(gridOf(out, id).steps).toEqual([{ t: 'token', value: 'bd' }, { t: 'token', value: 'sd' }]);
    expect(serialize(out)).toBe('$: s("bd sd")');
  });

  it('setSound updates a note row sound', () => {
    const model = parse('$: note("c3 e3").s("sine")');
    const id = model.nodes[0].id;
    const out = setSound(model, id, 'sawtooth');
    expect(serialize(out)).toBe('$: note("c3 e3").s("sawtooth")');
  });

  it('add/remove/set effect', () => {
    const model = parse('$: s("bd ~")');
    const id = model.nodes[0].id;
    const withGain = addEffect(model, id, { name: 'gain', value: 0.5 });
    expect(gridOf(withGain, id).effects).toEqual([{ name: 'gain', value: 0.5 }]);

    const changed = setEffect(withGain, id, 0, { name: 'gain', value: 0.9 });
    expect(gridOf(changed, id).effects).toEqual([{ name: 'gain', value: 0.9 }]);

    const removed = removeEffect(changed, id, 0);
    expect(gridOf(removed, id).effects).toEqual([]);
  });
});
