import {
  CATEGORY_INFO,
  CATEGORY_ORDER,
  functionsByCategory,
  type ArgSpec,
  type FnSpec,
} from './strudel-functions';

/**
 * Generates Blockly block definitions and the toolbox from the Strudel
 * function catalog.
 *
 * Source (`s`, `note`, …) and method (`.gain`, `.s`, …) blocks are **statement**
 * blocks so a pattern reads as a vertical chain under a `play` C-block:
 *
 *     [play]
 *       [sound "bd ~ bd ~"]
 *       [.gain 0.5]
 *
 * Argument values are inline fields (Scratch/makecode style). Signal blocks stay
 * value reporters so they can nest as arguments.
 */

export const BLOCK_COLOUR = {
  play: CATEGORY_INFO.structure.colour,
  value: CATEGORY_INFO.value.colour,
} as const;

export const PLAY_TYPE = 'strudel_play';
export const NUMBER_TYPE = 'strudel_number';
export const TEXT_TYPE = 'strudel_text';
export const EXPR_TYPE = 'strudel_raw_expr';

const safe = (name: string) => name.replace(/[^A-Za-z0-9]/g, '_');

export const factoryType = (name: string) => `strudel_f_${safe(name)}`;
export const methodType = (name: string) => `strudel_m_${safe(name)}`;
export const signalType = (name: string) => `strudel_v_${safe(name)}`;
export const settingType = (name: string) => `strudel_set_${safe(name)}`;

export const isSettingType = (type: string) => type.startsWith('strudel_set_');
export const isFactoryType = (type: string) => type.startsWith('strudel_f_');
export const isMethodType = (type: string) => type.startsWith('strudel_m_');

export const argField = (i: number) => `ARG_${i}`;

let _bySafeName: Map<string, FnSpec> | null = null;
function findBySafeName(safeName: string): FnSpec | undefined {
  if (!_bySafeName) {
    _bySafeName = new Map();
    for (const list of Object.values(functionsByCategory())) {
      for (const fn of list) {
        if (!_bySafeName.has(safe(fn.name))) _bySafeName.set(safe(fn.name), fn);
      }
    }
  }
  return _bySafeName.get(safeName);
}

/** Spec + arguments for a registered block type (used by the generator). */
export interface ResolvedBlock {
  spec: FnSpec;
  form: 'factory' | 'method' | 'signal' | 'setting';
}

export function resolveBlock(type: string): ResolvedBlock | undefined {
  let mm = type.match(/^strudel_f_(.+)$/);
  if (mm) {
    const spec = findBySafeName(mm[1]);
    return spec ? { spec, form: 'factory' } : undefined;
  }
  mm = type.match(/^strudel_m_(.+)$/);
  if (mm) {
    const spec = findBySafeName(mm[1]);
    return spec ? { spec, form: 'method' } : undefined;
  }
  mm = type.match(/^strudel_v_(.+)$/);
  if (mm) {
    const spec = findBySafeName(mm[1]);
    return spec ? { spec, form: 'signal' } : undefined;
  }
  mm = type.match(/^strudel_set_(.+)$/);
  if (mm) {
    const spec = findBySafeName(mm[1]);
    return spec ? { spec, form: 'setting' } : undefined;
  }
  return undefined;
}

function argFieldDef(spec: ArgSpec, i: number): Record<string, unknown> {
  const name = argField(i);
  const tooltip = spec.name;
  if (spec.type === 'number') {
    return {
      type: 'field_number',
      name,
      value: Number(spec.default) || 0,
      min: spec.min,
      max: spec.max,
      // NB: Blockly's field_number `precision` is the *step* value, not decimals.
      precision: spec.step && spec.step > 0 ? spec.step : 1,
      tooltip,
    };
  }
  return { type: 'field_input', name, text: String(spec.default ?? ''), tooltip };
}

function messageFor(form: 'factory' | 'method' | 'signal' | 'setting', name: string, n: number): string {
  const prefix = form === 'method' ? `.${name}` : name;
  const ph = Array.from({ length: n }, (_, i) => `%${i + 1}`);
  return n > 0 ? `${prefix}( ${ph.join(', ')} )` : `${prefix}()`;
}

function argDefs(specs: ArgSpec[], offset: number): Record<string, unknown>[] {
  return specs.map((s, i) => argFieldDef(s, i + offset));
}

/** JSON block definitions for every catalog entry. */
export function buildBlockDefinitions(): Record<string, unknown>[] {
  const defs: Record<string, unknown>[] = [];
  const byCat = functionsByCategory();

  for (const cat of CATEGORY_ORDER) {
    for (const fn of byCat[cat]) {
      const colour = CATEGORY_INFO[cat].colour;
      const nArgs = fn.args.length;

      if (fn.role === 'signal') {
        defs.push({
          type: signalType(fn.name),
          message0: fn.name,
          output: 'Pattern',
          colour,
          tooltip: fn.detail,
        });
        continue;
      }

      if (fn.role === 'setting') {
        defs.push({
          type: settingType(fn.name),
          message0: messageFor('factory', fn.name, nArgs),
          args0: argDefs(fn.args, 0),
          previousStatement: null,
          nextStatement: null,
          colour,
          tooltip: fn.detail,
        });
        continue;
      }

      // source block (statement; top of a chain)
      defs.push({
        type: factoryType(fn.name),
        message0: messageFor('factory', fn.name, nArgs),
        args0: argDefs(fn.args, 0),
        previousStatement: null,
        nextStatement: null,
        colour,
        tooltip: fn.detail,
      });
      // method block (statement; chains below the source)
      defs.push({
        type: methodType(fn.name),
        message0: messageFor('method', fn.name, nArgs),
        args0: argDefs(fn.args, 0),
        previousStatement: null,
        nextStatement: null,
        colour,
        tooltip: `${fn.detail} — chains onto the pattern above`,
      });
    }
  }

  // core blocks
  defs.push({
    type: PLAY_TYPE,
    message0: 'play %1',
    args0: [{ type: 'input_statement', name: 'PATTERN' }],
    message1: 'label %1  muted %2',
    args1: [
      { type: 'field_input', name: 'LABEL', text: '' },
      { type: 'field_checkbox', name: 'MUTED', checked: false },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: BLOCK_COLOUR.play,
    tooltip: 'A top-level Strudel pattern. Set label to `$` for a `$:` section.',
  });
  defs.push({
    type: NUMBER_TYPE,
    message0: '%1',
    args0: [{ type: 'field_number', name: 'VALUE', value: 0 }],
    output: 'Number',
    colour: BLOCK_COLOUR.value,
    tooltip: 'A number',
  });
  defs.push({
    type: TEXT_TYPE,
    message0: '%1',
    args0: [{ type: 'field_input', name: 'VALUE', text: '' }],
    output: 'String',
    colour: BLOCK_COLOUR.value,
    tooltip: 'A string',
  });
  defs.push({
    type: EXPR_TYPE,
    message0: '%1',
    args0: [{ type: 'field_input', name: 'VALUE', text: '' }],
    output: null,
    colour: BLOCK_COLOUR.value,
    tooltip: 'A raw expression emitted verbatim (e.g. `sine.range(200,2000)`)',
  });

  return defs;
}

/** Build the Blockly toolbox definition. */
export function buildToolbox(): Record<string, unknown> {
  const byCat = functionsByCategory();
  const contents: Record<string, unknown>[] = [];

  for (const cat of CATEGORY_ORDER) {
    const fns = byCat[cat];
    if (!fns.length) continue;
    const blocks: Record<string, unknown>[] = [];
    for (const fn of fns) {
      const type =
        fn.role === 'signal'
          ? signalType(fn.name)
          : fn.role === 'setting'
            ? settingType(fn.name)
            : fn.role === 'factory'
              ? factoryType(fn.name)
              : methodType(fn.name);
      blocks.push({ kind: 'block', type });
    }
    contents.push({
      kind: 'category',
      name: CATEGORY_INFO[cat].label,
      colour: CATEGORY_INFO[cat].colour,
      contents: blocks,
    });
  }

  contents.push({
    kind: 'category',
    name: 'Play',
    colour: BLOCK_COLOUR.play,
    contents: [{ kind: 'block', type: PLAY_TYPE }],
  });

  return { kind: 'categoryToolbox', contents };
}

const NUM_RE = /^-?(?:\d+\.?\d*|\.\d+)$/;
const IDENT_RE = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\([^)]*\))*$/;

/** Format a smart (`value`-type) argument so it never becomes syntactically broken. */
export function formatValueArg(raw: string, fallback: string | number = ''): string {
  const text = (raw ?? '').toString().trim();
  const value = text === '' ? String(fallback ?? '') : text;
  if (value === '') return '""';
  if (NUM_RE.test(value)) return value;
  if (value.startsWith('"') || value.startsWith("'")) return value;
  if (value.startsWith('[') || value.startsWith('{')) return value;
  if (value.includes('=>') || value.includes('(') || value.includes('.')) return value;
  if (IDENT_RE.test(value)) return value;
  return JSON.stringify(value);
}

/** Format one argument into emitted code. */
export function formatArg(spec: ArgSpec, raw: unknown): string {
  if (spec.type === 'number') {
    const n = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(n) ? String(n) : String(spec.default ?? 0);
  }
  if (spec.type === 'text') {
    const text = raw === undefined || raw === null || raw === '' ? String(spec.default ?? '') : String(raw);
    return JSON.stringify(text);
  }
  return formatValueArg(String(raw ?? ''), spec.default);
}
