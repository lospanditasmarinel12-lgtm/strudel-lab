import { nanoid } from 'nanoid';
import { serializeNode } from './structure';
import type {
  ContainerNode,
  GridPatternNode,
  PatternNode,
  SectionNode,
  StepTree,
  StructureModel,
  StructureNode,
  VisualEffect,
} from './visual-model';

/**
 * Pure edit operations over `StructureModel`. Each returns a new model (or the
 * same reference when the operation is a no-op) and never mutates its input.
 */

export function cloneModel(model: StructureModel): StructureModel {
  return { nodes: model.nodes.map(cloneNode) };
}

function clonePattern(p: PatternNode): PatternNode {
  return p.kind === 'raw-pattern' ? { ...p } : { ...p, steps: [...p.steps], effects: p.effects.map((e) => ({ ...e })) };
}

function cloneNode(node: StructureNode): StructureNode {
  if (node.kind === 'section') return { ...node, pattern: clonePattern(node.pattern) };
  if (node.kind === 'container') return { ...node, children: node.children.map(clonePattern) };
  return { ...node };
}

function isGridSection(node: StructureNode): node is SectionNode & { pattern: GridPatternNode } {
  return node.kind === 'section' && node.pattern.kind === 'grid';
}

export function findNode(model: StructureModel, id: string): StructureNode | undefined {
  return model.nodes.find((n) => n.id === id);
}

export function addNode(model: StructureModel, node: StructureNode, index?: number): StructureModel {
  const nodes = [...model.nodes];
  const at = index === undefined ? nodes.length : Math.max(0, Math.min(nodes.length, index));
  nodes.splice(at, 0, node);
  return { nodes };
}

export function removeNode(model: StructureModel, id: string): StructureModel {
  const nodes = model.nodes.filter((n) => n.id !== id);
  return nodes.length === model.nodes.length ? model : { nodes };
}

export function replaceNode(model: StructureModel, id: string, node: StructureNode): StructureModel {
  let changed = false;
  const nodes = model.nodes.map((n) => {
    if (n.id === id) {
      changed = true;
      return node;
    }
    return n;
  });
  return changed ? { nodes } : model;
}

export function moveNode(model: StructureModel, id: string, toIndex: number): StructureModel {
  const from = model.nodes.findIndex((n) => n.id === id);
  if (from < 0) return model;
  const nodes = [...model.nodes];
  const [moved] = nodes.splice(from, 1);
  const at = Math.max(0, Math.min(nodes.length, toIndex));
  nodes.splice(at, 0, moved);
  return { nodes };
}

export function duplicateNode(model: StructureModel, id: string): StructureModel {
  const index = model.nodes.findIndex((n) => n.id === id);
  if (index < 0) return model;
  const copy = cloneNode(model.nodes[index]);
  copy.id = nanoid(8);
  const nodes = [...model.nodes];
  nodes.splice(index + 1, 0, copy);
  return { nodes };
}

export function setMuted(model: StructureModel, id: string, muted: boolean): StructureModel {
  const nodes = model.nodes.map((n) => (n.id === id && n.kind === 'section' ? { ...n, muted } : n));
  return { nodes };
}

/** Wrap the given top-level nodes (in order) into a new `stack`/`cat` container. */
export function wrapInContainer(model: StructureModel, ids: string[], op: 'stack' | 'cat'): StructureModel {
  const idSet = new Set(ids);
  const wrapped = model.nodes.filter((n) => idSet.has(n.id));
  if (wrapped.length === 0) return model;
  const rest = model.nodes.filter((n) => !idSet.has(n.id));

  const children: PatternNode[] = wrapped.map((n) => {
    if (isGridSection(n)) return n.pattern;
    if (n.kind === 'section' && n.pattern.kind === 'raw-pattern') return n.pattern;
    return { kind: 'raw-pattern', id: nanoid(8), code: serializeNode(n) };
  });

  const container: ContainerNode = { kind: 'container', id: nanoid(8), op, children };
  const firstIndex = model.nodes.findIndex((n) => idSet.has(n.id));
  const insertAt = rest.filter((_, i) => i < firstIndex).length;
  rest.splice(insertAt, 0, container);
  return { nodes: rest };
}

// ---------------------------------------------------------------------------
// Container child edits
// ---------------------------------------------------------------------------

function updateContainer(
  model: StructureModel,
  containerId: string,
  update: (c: ContainerNode) => ContainerNode,
): StructureModel {
  let changed = false;
  const nodes = model.nodes.map((n) => {
    if (n.kind === 'container' && n.id === containerId) {
      changed = true;
      return update(n);
    }
    return n;
  });
  return changed ? { nodes } : model;
}

export function removeContainerChild(model: StructureModel, containerId: string, index: number): StructureModel {
  return updateContainer(model, containerId, (c) => ({
    ...c,
    children: c.children.filter((_, i) => i !== index),
  }));
}

export function moveContainerChild(
  model: StructureModel,
  containerId: string,
  index: number,
  toIndex: number,
): StructureModel {
  return updateContainer(model, containerId, (c) => {
    const children = [...c.children];
    if (index < 0 || index >= children.length) return c;
    const [moved] = children.splice(index, 1);
    children.splice(Math.max(0, Math.min(children.length, toIndex)), 0, moved);
    return { ...c, children };
  });
}

export function duplicateContainerChild(model: StructureModel, containerId: string, index: number): StructureModel {
  return updateContainer(model, containerId, (c) => {
    if (index < 0 || index >= c.children.length) return c;
    const copy = clonePattern(c.children[index]);
    copy.id = nanoid(8);
    const children = [...c.children];
    children.splice(index + 1, 0, copy);
    return { ...c, children };
  });
}

// ---------------------------------------------------------------------------
// Grid (pattern) edits
// ---------------------------------------------------------------------------

function updateGridPattern(
  model: StructureModel,
  sectionId: string,
  update: (p: GridPatternNode) => GridPatternNode,
): StructureModel {
  const nodes = model.nodes.map((n) => {
    if (n.id === sectionId && isGridSection(n)) {
      return { ...n, pattern: update(n.pattern) };
    }
    return n;
  });
  return { nodes };
}

export function setCell(
  model: StructureModel,
  sectionId: string,
  cellIndex: number,
  cell: StepTree,
): StructureModel {
  return updateGridPattern(model, sectionId, (p) => {
    const steps = [...p.steps];
    steps[cellIndex] = cell;
    return { ...p, steps };
  });
}

export function setSteps(model: StructureModel, sectionId: string, steps: StepTree[]): StructureModel {
  return updateGridPattern(model, sectionId, (p) => ({ ...p, steps }));
}

export function setSound(model: StructureModel, sectionId: string, sound: string): StructureModel {
  return updateGridPattern(model, sectionId, (p) => ({ ...p, sound }));
}

export function addEffect(model: StructureModel, sectionId: string, effect: VisualEffect): StructureModel {
  return updateGridPattern(model, sectionId, (p) => ({ ...p, effects: [...p.effects, effect] }));
}

export function removeEffect(model: StructureModel, sectionId: string, index: number): StructureModel {
  return updateGridPattern(model, sectionId, (p) => ({ ...p, effects: p.effects.filter((_, i) => i !== index) }));
}

export function setEffect(
  model: StructureModel,
  sectionId: string,
  index: number,
  effect: VisualEffect,
): StructureModel {
  return updateGridPattern(model, sectionId, (p) => ({
    ...p,
    effects: p.effects.map((e, i) => (i === index ? effect : e)),
  }));
}
