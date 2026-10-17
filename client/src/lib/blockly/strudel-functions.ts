/**
 * Strudel block catalog.
 *
 * Single source of truth for the Blockly toolbox, block definitions, argument
 * types and defaults. Seeded from the Strudel documentation
 * (`docs/reference/strudel/*.html`) and `client/src/lib/modifier-registry.ts`.
 *
 * A function is one of:
 *  - `factory` — a root call, e.g. `s("bd")`, `note("c e g")`, `run(4)`.
 *  - `method`  — a chained call, e.g. `.fast(2)`, `.room(0.5)`, `.s("piano")`.
 *  - `signal`  — a bare identifier, e.g. `sine`, `perlin`, `rand`.
 *  - `setting` — a standalone statement, e.g. `setcps(0.9)`.
 *
 * `signal` factories that require arguments (e.g. `irand(8)`) are declared as a
 * `factory` in the `signal` category instead.
 */

export type FnCategory =
  | 'sound'
  | 'note'
  | 'rhythm'
  | 'time'
  | 'effect'
  | 'signal'
  | 'random'
  | 'conditional'
  | 'tonal'
  | 'structure'
  | 'value';

export type FnRole = 'factory' | 'method' | 'signal' | 'setting';

export type ArgType = 'number' | 'text' | 'value';

export interface ArgSpec {
  /** Parameter name from the docs (used for tooltips). */
  name: string;
  type: ArgType;
  /** Default written when the input is empty. */
  default: string | number;
  min?: number;
  max?: number;
  step?: number;
}

export interface FnSpec {
  name: string;
  role: FnRole;
  category: FnCategory;
  detail: string;
  args: ArgSpec[];
  synonyms?: string[];
}

export const CATEGORY_INFO: Record<FnCategory, { label: string; colour: string }> = {
  sound: { label: 'Sounds', colour: '#FFB000' },
  note: { label: 'Notes', colour: '#4BE38A' },
  rhythm: { label: 'Rhythm (mini-notation)', colour: '#9BE7C4' },
  time: { label: 'Time', colour: '#6FB7FF' },
  effect: { label: 'Effects', colour: '#E0A9FF' },
  signal: { label: 'Signals', colour: '#FFCB57' },
  random: { label: 'Random', colour: '#FF6B4A' },
  conditional: { label: 'Conditional', colour: '#7FE0C0' },
  tonal: { label: 'Tonal', colour: '#4BE38A' },
  structure: { label: 'Structure', colour: '#6FB7FF' },
  value: { label: 'Values & settings', colour: '#93A69E' },
};

export const CATEGORY_ORDER: FnCategory[] = [
  'sound',
  'note',
  'rhythm',
  'time',
  'effect',
  'signal',
  'random',
  'conditional',
  'tonal',
  'structure',
  'value',
];

// ---------------------------------------------------------------------------
// argument helpers
// ---------------------------------------------------------------------------

const txt = (name: string, def = ''): ArgSpec => ({ name, type: 'text', default: def });
/** Smart argument: numbers/identifiers/calls emitted verbatim, else quoted. */
const val = (name: string, def = ''): ArgSpec => ({ name, type: 'value', default: def });
const num = (name: string, def = 0, min?: number, max?: number, step?: number): ArgSpec => ({
  name,
  type: 'number',
  default: def,
  min,
  max,
  step,
});

// ---------------------------------------------------------------------------
// catalog
// ---------------------------------------------------------------------------

const f = (
  name: string,
  category: FnCategory,
  detail: string,
  args: ArgSpec[] = [],
  synonyms?: string[],
): FnSpec => ({ name, role: 'factory', category, detail, args, synonyms });

const m = (
  name: string,
  category: FnCategory,
  detail: string,
  args: ArgSpec[] = [],
  synonyms?: string[],
): FnSpec => ({ name, role: 'method', category, detail, args, synonyms });

const sig = (name: string, detail: string, category: FnCategory = 'signal'): FnSpec => ({
  name,
  role: 'signal',
  category,
  detail,
  args: [],
});

const set = (name: string, detail: string, args: ArgSpec[] = []): FnSpec => ({
  name,
  role: 'setting',
  category: 'value',
  detail,
  args,
});

export const STRUDEL_FUNCTIONS: FnSpec[] = [
  // --- factories -----------------------------------------------------------
  f('s', 'sound', 'Play a sound/sample pattern', [txt('pattern', 'bd ~ bd ~')], ['sound']),
  f('note', 'note', 'Play a note pattern', [txt('pattern', 'c3 e3 g3 b3')]),
  f('n', 'note', 'Play a numeric pattern', [txt('pattern', '0 2 4 6')]),
  f('chord', 'tonal', 'Play a chord pattern', [txt('pattern', 'Cmaj7 Fmaj7')]),
  f('run', 'note', 'Numbers from 0 to n-1', [num('n', 4, 0, 128, 1)]),
  f('binary', 'rhythm', 'Binary rhythm from a number', [num('n', 5, 0, 65535, 1)]),
  f('binaryN', 'rhythm', 'Binary rhythm padded to n bits', [num('n', 5, 0, 65535, 1), num('nBits', 16, 1, 64, 1)]),
  sig('silence', 'A pattern of nothing', 'structure'),
  f('irand', 'signal', 'Random integer pattern', [num('n', 8, 1, 1024, 1)]),
  sig('brand', 'Random boolean pattern'),
  f('brandBy', 'signal', 'Random boolean by probability', [num('probability', 0.5, 0, 1, 0.01)]),
  sig('perlin', '1D Perlin noise'),
  sig('noise', 'Pink noise'),

  // --- structure -----------------------------------------------------------
  f('register', 'structure', 'Register a custom function', [txt('name', 'myFunc'), val('fn', '')]),

  // --- signals -------------------------------------------------------------
  sig('sine', 'Continuous sine signal'),
  sig('cosine', 'Continuous cosine signal'),
  sig('saw', 'Continuous sawtooth signal'),
  sig('tri', 'Continuous triangle signal'),
  sig('square', 'Continuous square signal'),
  sig('rand', 'Continuous random signal'),
  sig('time', 'Continuous time signal'),
  sig('mousex', 'Mouse X signal'),
  sig('mousey', 'Mouse Y signal'),

  // --- rhythm (mini-notation helpers) -------------------------------------
  m('struct', 'rhythm', 'Apply a rhythm structure', [txt('pattern', '1 0 1 0')]),
  m('mask', 'rhythm', 'Mask events by binary pattern', [txt('pattern', '1 1 0 0')]),

  // --- time ----------------------------------------------------------------
  m('fast', 'time', 'Speed up a pattern', [num('factor', 2, 0.25, 16, 0.25)], ['density']),
  m('slow', 'time', 'Slow down a pattern', [num('factor', 2, 0.25, 16, 0.25)], ['sparsity']),
  m('early', 'time', 'Nudge earlier in time', [num('cycles', 0.1, 0, 4, 0.01)]),
  m('late', 'time', 'Nudge later in time', [num('cycles', 0.1, 0, 4, 0.01)]),
  m('rev', 'time', 'Reverse each cycle'),
  m('palindrome', 'time', 'Alternate forwards/backwards'),
  m('iter', 'time', 'Rotate subdivisions each cycle', [num('n', 4, 1, 16, 1)]),
  m('iterBack', 'time', 'Reverse iterate', [num('n', 4, 1, 16, 1)]),
  m('ply', 'time', 'Repeat each event n times', [num('n', 2, 1, 16, 1)]),
  m('segment', 'time', 'Sample the pattern n times per cycle', [num('n', 4, 1, 64, 1)], ['seg']),
  m('compress', 'time', 'Compress a cycle into a timespan', [num('start', 0.25, 0, 1, 0.01), num('end', 0.75, 0, 1, 0.01)]),
  m('zoom', 'time', 'Play a portion of the pattern', [num('start', 0.25, 0, 1, 0.01), num('end', 0.75, 0, 1, 0.01)]),
  m('linger', 'time', 'Repeat a fraction of the pattern', [num('fraction', 0.5, 0, 1, 0.01)]),
  m('fastGap', 'time', 'Speed up leaving a gap', [num('factor', 2, 1, 16, 0.25)], ['fastgap']),
  m('euclid', 'time', 'Euclidean rhythm', [num('pulses', 3, 1, 32, 1), num('steps', 8, 1, 32, 1)]),
  m('euclidRot', 'time', 'Euclidean rhythm with rotation', [num('pulses', 3, 1, 32, 1), num('steps', 8, 1, 32, 1), num('rotation', 0, 0, 32, 1)]),
  m('euclidLegato', 'time', 'Legato Euclidean rhythm', [num('pulses', 3, 1, 32, 1), num('steps', 8, 1, 32, 1)]),
  m('ribbon', 'time', 'Loop a slice of the pattern', [num('offset', 1, 0, 128, 1), num('cycles', 2, 0.5, 16, 0.5)]),
  m('swingBy', 'time', 'Swing by amount per subdivision', [num('amount', 0.333, 0, 1, 0.01), num('subdivision', 4, 1, 16, 1)]),
  m('swing', 'time', 'Swing by 1/3', [num('subdivision', 4, 1, 16, 1)]),
  m('cpm', 'time', 'Set cycles per minute', [num('cpm', 90, 1, 600, 1)]),
  m('clip', 'time', 'Clip event duration', [num('factor', 1, 0, 8, 0.1)], ['legato']),
  m('repeatCycles', 'time', 'Repeat a cycle n times', [num('n', 2, 1, 32, 1)]),
  m('shuffle', 'time', 'Shuffle subdivisions', [num('n', 4, 1, 32, 1)]),
  m('scramble', 'time', 'Scramble subdivisions', [num('n', 4, 1, 32, 1)]),

  // --- effects (control parameters) ---------------------------------------
  m('gain', 'effect', 'Output volume', [num('gain', 0.8, 0, 2, 0.01)]),
  m('velocity', 'effect', 'Velocity/volume', [num('velocity', 0.8, 0, 1, 0.01)]),
  m('lpf', 'effect', 'Low-pass filter cutoff', [num('freq', 800, 20, 20000, 10)], ['cutoff']),
  m('hpf', 'effect', 'High-pass filter cutoff', [num('freq', 200, 20, 20000, 10)]),
  m('bpf', 'effect', 'Band-pass filter cutoff', [num('freq', 800, 20, 20000, 10)]),
  m('lpq', 'effect', 'Low-pass resonance', [num('q', 1, 0, 50, 0.1)]),
  m('hpq', 'effect', 'High-pass resonance', [num('q', 1, 0, 50, 0.1)]),
  m('bpq', 'effect', 'Band-pass resonance', [num('q', 1, 0, 50, 0.1)]),
  m('pan', 'effect', 'Stereo pan', [num('pan', 0, -1, 1, 0.01)]),
  m('room', 'effect', 'Reverb amount', [num('room', 0.5, 0, 1, 0.01)]),
  m('rsize', 'effect', 'Reverb room size', [num('size', 0.7, 0, 1, 0.01)], ['roomsize']),
  m('roomfade', 'effect', 'Reverb fade time', [num('fade', 2, 0, 10, 0.1)]),
  m('roomlp', 'effect', 'Reverb low-pass', [num('freq', 8000, 20, 20000, 10)]),
  m('roomdim', 'effect', 'Reverb high-pass', [num('freq', 100, 20, 20000, 10)]),
  m('delay', 'effect', 'Delay amount', [num('amount', 0.3, 0, 1, 0.01)]),
  m('delaytime', 'effect', 'Delay time', [num('time', 0.25, 0, 4, 0.01)]),
  m('delayfeedback', 'effect', 'Delay feedback', [num('feedback', 0.5, 0, 1, 0.01)]),
  m('attack', 'effect', 'Envelope attack', [num('time', 0.01, 0, 2, 0.001)]),
  m('decay', 'effect', 'Envelope decay', [num('time', 0.3, 0, 2, 0.01)]),
  m('sustain', 'effect', 'Envelope sustain level', [num('level', 0.8, 0, 1, 0.01)]),
  m('release', 'effect', 'Envelope release', [num('time', 0.5, 0, 4, 0.01)]),
  m('adsr', 'effect', 'Full ADSR envelope', [num('attack', 0.01, 0, 2, 0.001), num('decay', 0.3, 0, 2, 0.01), num('sustain', 0.8, 0, 1, 0.01), num('release', 0.5, 0, 4, 0.01)]),
  m('hold', 'effect', 'Sample hold time', [num('time', 0.1, 0, 4, 0.01)]),
  m('speed', 'effect', 'Playback speed', [num('speed', 1, -4, 4, 0.01)]),
  m('begin', 'effect', 'Sample start position', [num('position', 0.25, 0, 1, 0.01)]),
  m('end', 'effect', 'Sample end position', [num('position', 0.75, 0, 1, 0.01)]),
  m('loop', 'effect', 'Loop the sample', [num('loop', 1, 0, 1, 1)]),
  m('loopBegin', 'effect', 'Loop start', [num('position', 0, 0, 1, 0.01)]),
  m('loopEnd', 'effect', 'Loop end', [num('position', 1, 0, 1, 0.01)]),
  m('cut', 'effect', 'Cut group', [num('group', 1, 0, 16, 1)]),
  m('orbit', 'effect', 'Output orbit/bus', [num('orbit', 0, 0, 16, 1)]),
  m('shape', 'effect', 'Wave shaping distortion', [num('amount', 0.3, 0, 1, 0.01)]),
  m('distort', 'effect', 'Distortion', [num('amount', 0.3, 0, 1, 0.01)]),
  m('crush', 'effect', 'Bit crush', [num('amount', 4, 1, 16, 1)]),
  m('coarse', 'effect', 'Coarse bit reduction', [num('amount', 4, 1, 16, 1)]),
  m('tremolo', 'effect', 'Tremolo depth', [num('depth', 0.5, 0, 1, 0.01)]),
  m('phaser', 'effect', 'Phaser speed', [num('speed', 1, 0, 10, 0.1)]),
  m('vowel', 'effect', 'Vowel formant', [txt('vowel', 'a')]),
  m('vib', 'effect', 'Vibrato depth', [num('depth', 0.5, 0, 1, 0.01)]),
  m('vibmod', 'effect', 'Vibrato rate', [num('rate', 5, 0, 20, 0.1)]),
  m('fm', 'effect', 'FM modulation index', [num('index', 1, 0, 20, 0.1)]),
  m('fmh', 'effect', 'FM harmonicity', [num('ratio', 1, 0, 20, 0.1)]),
  m('panchor', 'effect', 'Pan anchor', [num('anchor', 0.5, 0, 1, 0.01)]),
  m('postgain', 'effect', 'Post gain', [num('gain', 1, 0, 4, 0.01)]),
  m('dry', 'effect', 'Dry signal amount', [num('amount', 0, 0, 1, 0.01)]),
  m('bandf', 'effect', 'Band-pass frequency', [num('freq', 800, 20, 20000, 10)]),
  m('drive', 'effect', 'Filter drive', [num('amount', 0.5, 0, 1, 0.01)]),
  m('ftype', 'effect', 'Filter type', [txt('type', 'ladder')]),

  // --- sample/synth selection as methods ----------------------------------
  m('s', 'sound', 'Set the sound/sample', [txt('sound', 'bd')], ['sound']),
  m('note', 'note', 'Set the note pattern', [txt('pattern', 'c3')]),
  m('n', 'note', 'Set the numeric pattern', [txt('pattern', '0')]),
  m('bank', 'sound', 'Select the sample bank', [txt('bank', 'RolandTR909')]),
  m('sound', 'sound', 'Set the sound/sample', [txt('sound', 'bd')]),
  m('scale', 'tonal', 'Interpret numbers as a scale', [txt('scale', 'C major')]),
  m('transpose', 'tonal', 'Transpose by semitones', [num('semitones', 12, -48, 48, 1)]),
  m('voicings', 'tonal', 'Set chord voicings', [txt('voicing', 'drop2')]),
  m('rootNotes', 'tonal', 'Set root note octave', [num('octave', 3, 0, 9, 1)]),
  m('add', 'note', 'Add a value to each event', [num('value', 0.5, -24, 24, 1)]),
  m('sub', 'note', 'Subtract a value from each event', [num('value', 0.5, -24, 24, 1)]),
  m('mul', 'note', 'Multiply each event', [num('value', 2, -8, 8, 0.1)]),
  m('div', 'note', 'Divide each event', [num('value', 2, -8, 8, 0.1)]),
  m('round', 'note', 'Round each event'),
  m('floor', 'note', 'Floor each event'),
  m('ceil', 'note', 'Ceil each event'),
  m('range', 'signal', 'Map a signal into a range', [num('min', 200, -2000, 20000, 1), num('max', 2000, -2000, 20000, 1)]),
  m('rangex', 'signal', 'Map a signal exponentially', [num('min', 0, 0, 1, 0.01), num('max', 1, 0, 1, 0.01)]),
  m('segment', 'signal', 'Discretise a signal', [num('n', 4, 1, 64, 1)]),
  m('sometimes', 'random', 'Apply a function sometimes', [val('fn', 'rev()')]),
  m('often', 'random', 'Apply a function often', [val('fn', 'rev()')]),
  m('rarely', 'random', 'Apply a function rarely', [val('fn', 'rev()')]),
  m('always', 'random', 'Always apply a function', [val('fn', 'rev()')]),
  m('never', 'random', 'Never apply a function', [val('fn', 'rev()')]),
  m('sometimesBy', 'random', 'Apply a function by probability', [num('probability', 0.5, 0, 1, 0.01), val('fn', 'rev()')]),
  m('degradeBy', 'random', 'Randomly remove events', [num('probability', 0.3, 0, 1, 0.01)]),
  m('undegradeBy', 'random', 'Inverse of degradeBy', [num('probability', 0.3, 0, 1, 0.01)]),
  m('degrade', 'random', 'Randomly remove ~50% of events'),
  m('choose', 'random', 'Choose from a list at random', [txt('values', 'bd, sd, cp')]),
  m('wchoose', 'random', 'Weighted random choice', [txt('values', 'bd, sd, cp')]),
  m('every', 'conditional', 'Apply every n cycles', [num('n', 4, 1, 32, 1), val('fn', 'rev()')]),
  m('when', 'conditional', 'Apply when a condition is true', [txt('condition', '<0.5, 1>'), val('fn', 'rev()')]),
  m('whenmod', 'conditional', 'Apply every n, skipping m', [num('n', 8, 1, 32, 1), num('m', 4, 1, 32, 1), val('fn', 'rev()')]),
  m('someCyclesBy', 'conditional', 'Apply an operation some cycles', [num('probability', 0.5, 0, 1, 0.01), val('fn', 'rev()')], ['somecyclesby']),
  m('firstOf', 'conditional', 'Apply to the first of each cycle', [val('fn', 'rev()')]),
  m('lastOf', 'conditional', 'Apply to the last of each cycle', [val('fn', 'rev()')]),

  // --- accumulation --------------------------------------------------------
  m('superimpose', 'time', 'Layer a transformed copy', [val('fn', 'fast(2)')]),
  m('layer', 'time', 'Layer transformed copies', [val('fn', 'rev()')]),
  m('off', 'time', 'Offset a transformed copy', [num('time', 0.125, 0, 4, 0.125), val('fn', 'add(4)')]),
  m('jux', 'effect', 'Juxtapose stereo via a function', [val('fn', 'rev()')]),
  m('juxBy', 'effect', 'Juxtapose with amount', [num('amount', 0.5, 0, 1, 0.01), val('fn', 'rev()')]),
  m('echo', 'effect', 'Echo a transformed copy', [num('time', 0.25, 0, 4, 0.125), num('feedback', 0.5, 0, 1, 0.01), val('fn', 'rev()')]),
  m('chunk', 'time', 'Chunked transform', [num('n', 4, 1, 16, 1), val('fn', 'rev()')]),
  m('chunkBack', 'time', 'Reverse chunked transform', [num('n', 4, 1, 16, 1), val('fn', 'rev()')]),
  m('striate', 'time', 'Striate into n pieces', [num('n', 4, 1, 32, 1)]),
  m('slice', 'time', 'Slice sample into n parts', [num('n', 4, 1, 32, 1), txt('pattern', '0 1 2 3')]),
  m('splice', 'time', 'Slice and reorder sample', [num('n', 4, 1, 32, 1), txt('pattern', '0 1 2 3')]),
  m('chop', 'time', 'Chop sample into n parts', [num('n', 4, 1, 32, 1)]),

  // --- settings ------------------------------------------------------------
  set('setcps', 'Set cycles per second', [num('cps', 0.5, 0.01, 10, 0.01)]),
  set('setcpm', 'Set cycles per minute', [num('cpm', 120, 20, 300, 1)]),
  set('samples', 'Load a sample map', [txt('url', 'github:tidalcycles/dirt-samples')]),
  set('hush', 'Stop all sound'),
];

/**
 * Fast lookup by (canonical) function name. First occurrence wins so a name that
 * is both a factory and a method (e.g. `s`, `note`) resolves to the factory,
 * which is what a chain root needs.
 */
export const FUNCTIONS_BY_NAME: Map<string, FnSpec> = (() => {
  const map = new Map<string, FnSpec>();
  for (const fn of STRUDEL_FUNCTIONS) if (!map.has(fn.name)) map.set(fn.name, fn);
  return map;
})();

/** Alias → canonical name. */
export const ALIASES = new Map<string, string>();
for (const fn of STRUDEL_FUNCTIONS) {
  for (const syn of fn.synonyms ?? []) {
    if (!FUNCTIONS_BY_NAME.has(syn)) ALIASES.set(syn, fn.name);
  }
}

/** Resolve a function name (following synonyms) to a spec. */
export function resolveFunction(name: string): FnSpec | undefined {
  return FUNCTIONS_BY_NAME.get(name) ?? FUNCTIONS_BY_NAME.get(ALIASES.get(name) ?? '');
}

/** Functions to show in the toolbox, grouped by category. */
export function functionsByCategory(): Record<FnCategory, FnSpec[]> {
  const out = {} as Record<FnCategory, FnSpec[]>;
  for (const cat of CATEGORY_ORDER) out[cat] = [];
  for (const fn of STRUDEL_FUNCTIONS) out[fn.category].push(fn);
  return out;
}
