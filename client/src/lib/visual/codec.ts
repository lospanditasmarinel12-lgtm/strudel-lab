import { parseStructure, serializeStructure, serializeNode } from './structure';
import {
  pickRowColor,
  type GridVisualRow,
  type RawVisualRow,
  type StepTree,
  type StructureModel,
  type StructureNode,
  type VisualModel,
  type VisualRow,
} from './visual-model';

/**
 * Codec: the single entry point for `code ⇄ StructureModel`.
 *
 * Invariants (enforced by tests):
 *  1. Idempotence — `serialize(parse(serialize(parse(code)))) === serialize(parse(code))`.
 *  2. Raw fidelity — every raw node's `code` appears byte-for-byte in the output.
 *  3. Order preservation — node order matches source order.
 */

export function parse(code: string): StructureModel {
  return parseStructure(code);
}

export function serialize(model: StructureModel): string {
  return serializeStructure(model);
}

/** The canonical form of `code` under the codec. */
export function canonicalize(code: string): string {
  return serialize(parse(code));
}

/** True when serialization is a fixed point (parse/serialize idempotent). */
export function isIdempotent(code: string): boolean {
  const once = serialize(parse(code));
  const twice = serialize(parse(once));
  return once === twice;
}

function collectRawCodes(model: StructureModel): string[] {
  const out: string[] = [];
  const walkNode = (node: StructureNode): void => {
    if (node.kind === 'raw') {
      out.push(node.code);
    } else if (node.kind === 'container') {
      for (const child of node.children) {
        if (child.kind === 'raw-pattern') out.push(child.code);
      }
    } else if (node.kind === 'section' && node.pattern.kind === 'raw-pattern') {
      out.push(node.pattern.code);
    }
  };
  model.nodes.forEach(walkNode);
  return out;
}

/** True when every raw region is preserved byte-for-byte after a round-trip. */
export function rawCodesPreserved(code: string): boolean {
  const model = parse(code);
  const out = serialize(model);
  return collectRawCodes(model).every((raw) => out.includes(raw));
}

// ---------------------------------------------------------------------------
// Legacy adapter (Phase 1 compatibility)
// ---------------------------------------------------------------------------

function isSimpleCell(cell: StepTree): cell is Extract<StepTree, { t: 'rest' | 'token' }> {
  return cell.t === 'rest' || cell.t === 'token';
}

function cellsToLegacySteps(
  cells: StepTree[],
): { on: boolean; value?: string }[] | null {
  if (!cells.every(isSimpleCell)) return null;
  return cells.map((c) => (c.t === 'rest' ? { on: false } : { on: true, value: c.value }));
}

/**
 * Down-cast a `StructureModel` to the legacy `VisualModel` used by the existing
 * block layer. Preserves legacy rules (single-source drum rows; anything else
 * becomes a `raw` row).
 */
export function toLegacyVisualModel(model: StructureModel): VisualModel {
  const rows: VisualRow[] = [];
  let stepsPerCycle = 0;

  const rawRow = (code: string, index: number): RawVisualRow => ({
    id: `legacy-raw-${index}`,
    kind: 'raw',
    name: code.split('\n').find((l) => l.trim())?.trim().slice(0, 28) ?? 'code',
    color: pickRowColor(index),
    code,
  });

  model.nodes.forEach((node, index) => {
    if (node.kind === 'raw') {
      rows.push(rawRow(node.code, index));
      return;
    }
    if (node.kind === 'container') {
      rows.push(rawRow(serializeNode(node), index));
      return;
    }
    // section
    const pattern = node.pattern;
    if (pattern.kind === 'raw-pattern') {
      rows.push(rawRow(pattern.code, index));
      return;
    }
    const steps = cellsToLegacySteps(pattern.steps);
    if (!steps) {
      rows.push(rawRow(serializeNode(node), index));
      return;
    }

    if (pattern.rowKind === 'drum') {
      const distinct = Array.from(new Set(steps.filter((s) => s.on).map((s) => s.value ?? '')));
      if (distinct.length > 1) {
        rows.push(rawRow(serializeNode(node), index));
        return;
      }
      const source = distinct[0] ?? 'bd';
      const row: GridVisualRow = {
        id: `legacy-${index}`,
        kind: 'drum',
        name: source,
        source,
        color: pickRowColor(index),
        steps: steps.map((s) => (s.on ? { on: true, value: source } : { on: false })),
        effects: pattern.effects,
        muted: node.muted,
      };
      rows.push(row);
      stepsPerCycle = Math.max(stepsPerCycle, steps.length);
    } else {
      const row: GridVisualRow = {
        id: `legacy-${index}`,
        kind: 'note',
        name: pattern.sound ?? 'sawtooth',
        source: pattern.sound ?? 'sawtooth',
        color: pickRowColor(index),
        steps,
        effects: pattern.effects,
        muted: node.muted,
      };
      rows.push(row);
      stepsPerCycle = Math.max(stepsPerCycle, steps.length);
    }
  });

  return { stepsPerCycle: stepsPerCycle > 0 ? stepsPerCycle : 16, rows };
}
