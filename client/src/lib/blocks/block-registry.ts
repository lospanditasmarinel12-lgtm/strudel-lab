import { PALETTE } from '@shared/schema';
import { ALL_MODIFIERS, type ModifierDef } from '@/lib/modifier-registry';
import { defaultEffectValue } from '@/lib/visual/visual-model';
import type { LegoPayload } from './drag-controller';

/**
 * Block registry — the single source of truth for the palette, the inspector,
 * and drop validation. Borrows Scratch/Blockly's idea of typed inputs with
 * shadow/default values, but stays in our own model (no Blockly).
 */

export type BlockCategory = 'pattern' | 'effect' | 'transform' | 'combinator' | 'value';

export interface BlockField {
  control: 'slider' | 'text' | 'none' | 'dropdown';
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  /** Shadow / default value written into generated code. */
  shadow: number | string;
}

export interface BlockDef {
  id: string;
  label: string;
  category: BlockCategory;
  detail?: string;
  color: string;
  /** Pattern blocks: the code inserted on drop. */
  code?: string;
  /** Method blocks: the method name (e.g. `gain`). */
  method?: string;
  field?: BlockField;
}

export const CATEGORY_COLORS: Record<BlockCategory, string> = {
  pattern: PALETTE.green,
  effect: PALETTE.amber,
  transform: PALETTE.blue,
  combinator: PALETTE.lavender,
  value: PALETTE.mint,
};

export const CATEGORY_LABELS: Record<BlockCategory, string> = {
  pattern: 'Patterns',
  effect: 'Effects',
  transform: 'Transforms',
  combinator: 'Combinators',
  value: 'Values',
};

const PATTERN_DEFS: Array<Omit<BlockDef, 'color'>> = [
  { id: 'pattern.kick', label: 'kick', category: 'pattern', code: '$: s("bd ~ bd ~")' },
  { id: 'pattern.snare', label: 'snare', category: 'pattern', code: '$: s("~ sd ~ sd")' },
  { id: 'pattern.hats', label: 'hats', category: 'pattern', code: '$: s("hh hh hh hh")' },
  { id: 'pattern.bass', label: 'bass', category: 'pattern', code: '$: note("c2 ~ c2 ~").s("sawtooth").gain(0.5)' },
  { id: 'pattern.melody', label: 'melody', category: 'pattern', code: '$: note("c3 e3 g3 b3").s("sawtooth").gain(0.3)' },
];

function categoryFor(mod: ModifierDef): BlockCategory {
  if (mod.category === 'audio') return 'effect';
  if (mod.category === 'pattern') return 'transform';
  if (mod.category === 'combinator') return 'combinator';
  return 'value';
}

function modifierToDef(mod: ModifierDef): BlockDef {
  const category = categoryFor(mod);
  return {
    id: `${category}.${mod.name}`,
    label: mod.name,
    category,
    detail: mod.detail,
    color: CATEGORY_COLORS[category],
    method: mod.name,
    field: {
      control: mod.controlType,
      min: mod.defaultMin,
      max: mod.defaultMax,
      step: mod.defaultStep,
      shadow: defaultEffectValue(mod.name),
    },
  };
}

export const BLOCK_DEFS: BlockDef[] = [
  ...PATTERN_DEFS.map((d) => ({ ...d, color: CATEGORY_COLORS.pattern })),
  ...ALL_MODIFIERS.map(modifierToDef),
];

export function getBlockDefs(category?: BlockCategory): BlockDef[] {
  return category ? BLOCK_DEFS.filter((d) => d.category === category) : BLOCK_DEFS;
}

export function getBlockDef(id: string): BlockDef | undefined {
  return BLOCK_DEFS.find((d) => d.id === id);
}

export function blocksByCategory(): Record<BlockCategory, BlockDef[]> {
  return {
    pattern: getBlockDefs('pattern'),
    effect: getBlockDefs('effect'),
    transform: getBlockDefs('transform'),
    combinator: getBlockDefs('combinator'),
    value: getBlockDefs('value'),
  };
}

/** Build a draggable payload from a registry block (for the palette). */
export function toPayload(def: BlockDef): LegoPayload {
  if (def.code) return { kind: 'pattern', label: def.label, code: def.code };
  if (def.category === 'combinator') {
    return { kind: 'combinator', label: def.label, wrapper: def.method as 'stack' | 'cat' };
  }
  const shadow = def.field?.shadow ?? '';
  const method = typeof shadow === 'string' ? `.${def.method}("${shadow}")` : `.${def.method}(${shadow})`;
  return { kind: 'method', label: def.label, method };
}

/**
 * Whether a drop is allowed ("never syntactically broken"): methods and
 * combinators require an existing pattern block; patterns may land anywhere.
 */
export function canDrop(payload: LegoPayload, target: 'pattern' | 'empty' | 'none'): boolean {
  if (payload.kind === 'pattern') return true;
  if (payload.kind === 'method' || payload.kind === 'combinator') return target === 'pattern';
  if (payload.kind === 'reorder') return target !== 'none';
  return false;
}
