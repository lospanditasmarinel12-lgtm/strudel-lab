import { nanoid } from 'nanoid';
import { DRUM_SAMPLES, MELODIC_SAMPLES, SYNTH_SAMPLES } from '@shared/schema';
import { getModifierDef } from '@/lib/modifier-registry';

export type GridRowKind = 'drum' | 'note';
export type VisualRowKind = GridRowKind | 'raw';

export interface VisualStep {
  on: boolean;
  /** Note value for melodic rows (ignored by drum rows). */
  value?: string;
}

export interface VisualEffect {
  name: string;
  value: number | string;
}

interface VisualRowBase {
  id: string;
  name: string;
  color: string;
  muted?: boolean;
}

export interface GridVisualRow extends VisualRowBase {
  kind: GridRowKind;
  /** Sample name (drum) or synth/sound name (note). */
  source: string;
  steps: VisualStep[];
  effects: VisualEffect[];
}

/** A block of code the grid cannot represent; preserved verbatim. */
export interface RawVisualRow extends VisualRowBase {
  kind: 'raw';
  code: string;
}

export type VisualRow = GridVisualRow | RawVisualRow;

export interface VisualModel {
  stepsPerCycle: number;
  rows: VisualRow[];
}

export const STEPS_OPTIONS = [8, 16, 32] as const;
export const DEFAULT_STEPS = 16;

export const SAMPLE_CHOICES: string[] = Array.from(
  new Set([...DRUM_SAMPLES, ...MELODIC_SAMPLES, ...SYNTH_SAMPLES]),
);

export const DEFAULT_DRUM_SAMPLES = ['bd', 'sd', 'hh', 'oh', 'cp'];

const ROW_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#a855f7', '#f59e0b', '#14b8a6', '#ec4899', '#84cc16'];

export function pickRowColor(index: number): string {
  return ROW_COLORS[index % ROW_COLORS.length];
}

export function emptySteps(count: number): VisualStep[] {
  return Array.from({ length: count }, () => ({ on: false }));
}

/** Pad or truncate a step array to `count` steps. */
export function resizeSteps(steps: VisualStep[], count: number): VisualStep[] {
  if (steps.length === count) return steps;
  if (steps.length > count) return steps.slice(0, count);
  return [...steps, ...emptySteps(count - steps.length)];
}

export function isGridRow(row: VisualRow): row is GridVisualRow {
  return row.kind === 'drum' || row.kind === 'note';
}

export function createDrumRow(sample = 'bd', stepsPerCycle = DEFAULT_STEPS, index = 0): GridVisualRow {
  return {
    id: nanoid(8),
    kind: 'drum',
    name: sample,
    source: sample,
    color: pickRowColor(index),
    steps: emptySteps(stepsPerCycle),
    effects: [],
  };
}

export function createNoteRow(sound = 'sawtooth', stepsPerCycle = DEFAULT_STEPS, index = 0): GridVisualRow {
  return {
    id: nanoid(8),
    kind: 'note',
    name: sound,
    source: sound,
    color: pickRowColor(index),
    steps: emptySteps(stepsPerCycle),
    effects: [],
  };
}

export const NOTE_SCALE = ['c3', 'e3', 'g3', 'b3', 'c4', 'e4', 'g4', 'b4'];

/** Sensible default for a newly added effect, based on its registry range. */
export function defaultEffectValue(name: string): number | string {
  const def = getModifierDef(name);
  if (!def) return 0;
  if (def.controlType === 'text' || def.controlType === 'none') return '';
  const min = def.defaultMin ?? 0;
  const max = def.defaultMax ?? 1;
  const step = def.defaultStep ?? 0.01;
  const mid = (min + max) / 2;
  return Number((Math.round(mid / step) * step).toFixed(4));
}

/** Toggle a step, assigning a default note for melodic rows when turning on. */
export function setRowStepOn(row: GridVisualRow, index: number, on: boolean): GridVisualRow {
  const steps = row.steps.map((step, i) => {
    if (i !== index) return step;
    if (!on) return { on: false };
    const value = row.kind === 'note' ? step.value || NOTE_SCALE[i % NOTE_SCALE.length] : row.source;
    return { on: true, value };
  });
  return { ...row, steps };
}

export function createDefaultVisualModel(): VisualModel {
  const stepsPerCycle = DEFAULT_STEPS;
  const rows: VisualRow[] = [
    createDrumRow('bd', stepsPerCycle, 0),
    createDrumRow('sd', stepsPerCycle, 1),
    createDrumRow('hh', stepsPerCycle, 2),
    createNoteRow('sawtooth', stepsPerCycle, 3),
  ];
  // A simple starting beat: kick on 1/9, snare on 5/13, hats on every other step.
  (rows[0] as GridVisualRow).steps[0].on = true;
  (rows[0] as GridVisualRow).steps[8].on = true;
  (rows[1] as GridVisualRow).steps[4].on = true;
  (rows[1] as GridVisualRow).steps[12].on = true;
  for (let i = 0; i < stepsPerCycle; i += 2) (rows[2] as GridVisualRow).steps[i].on = true;
  const notes = ['c3', 'e3', 'g3', 'b3'];
  notes.forEach((n, i) => {
    const step = (rows[3] as GridVisualRow).steps[i * 2];
    step.on = true;
    step.value = n;
  });
  return { stepsPerCycle, rows };
}

// ===========================================================================
// Phase 1 — richer, round-trippable model (structure + pattern + step tree)
// ===========================================================================

/** 1-based inclusive line range, plus optional char offsets into the source. */
export interface SrcRange {
  startLine: number;
  endLine: number;
  startOffset?: number;
  endOffset?: number;
}

interface RichNodeBase {
  /** Stable within a single parse; derived from position. */
  id: string;
  /** Where this node came from in the source (for range-based patching). */
  src?: SrcRange;
}

/**
 * Mini-notation step tree (tiers 1–2). Anything outside these constructs makes
 * the enclosing region a `raw` node instead.
 */
export type StepTree =
  | { t: 'rest' }
  | { t: 'token'; value: string }
  | {
      t: 'group';
      op: 'seq' | 'slow' | 'fast' | 'alt' | 'stack';
      factor?: number;
      children: StepTree[];
      /** For `stack`: true when it is the row-level stack (no surrounding brackets). */
      top?: boolean;
    }
  | { t: 'euclid'; fill: number; steps: number; rotate?: number; child: StepTree }
  | { t: 'repeat'; count: number; child: StepTree }
  | { t: 'elongate'; weight: number; child: StepTree }
  | { t: 'prob'; value: number; child: StepTree };

export type PatternNode = GridPatternNode | RawPatternNode;

export interface GridPatternNode extends RichNodeBase {
  kind: 'grid';
  rowKind: 'drum' | 'note';
  /** `.s("…")` sound/synth for note rows (drum rows carry the sample per step). */
  sound?: string;
  /** Top-level cells; length is the cycle length. A top-level `,` yields one
   * `stack` group cell. */
  steps: StepTree[];
  effects: VisualEffect[];
}

export interface RawPatternNode extends RichNodeBase {
  kind: 'raw-pattern';
  code: string;
}

export type StructureNode = SectionNode | ContainerNode | RawNode;

export interface SectionNode extends RichNodeBase {
  kind: 'section';
  /** `$:` label if present. */
  label?: string;
  pattern: PatternNode;
  muted: boolean;
}

export interface ContainerNode extends RichNodeBase {
  kind: 'container';
  op: 'stack' | 'cat';
  children: PatternNode[];
}

/** Anything the model cannot represent, preserved byte-exact. */
export interface RawNode extends RichNodeBase {
  kind: 'raw';
  code: string;
}

export interface StructureModel {
  nodes: StructureNode[];
}
